#!/usr/bin/env python3

import argparse
import asyncio
import base64
import hashlib
import json
import os
import shlex
import tempfile
from pathlib import Path
from typing import Any

import asyncssh


LOOPBACK = "127.0.0.1"
USERNAME = "sessiondock"
PROBE = b"sessiondock-fixture-probe"


class FixtureSSHServer(asyncssh.SSHServer):
    def __init__(self, client_key: asyncssh.SSHKey, allowed_ports: set[int]) -> None:
        self._client_key = client_key
        self._allowed_ports = allowed_ports

    def public_key_auth_supported(self) -> bool:
        return True

    def validate_public_key(self, username: str, key: asyncssh.SSHKey) -> bool:
        return username == USERNAME and key == self._client_key

    def connection_requested(
        self,
        dest_host: str,
        dest_port: int,
        orig_host: str,
        orig_port: int,
    ) -> bool:
        del orig_host, orig_port
        return dest_host in {LOOPBACK, "localhost"} and dest_port in self._allowed_ports

    def server_requested(self, listen_host: str, listen_port: int) -> bool:
        del listen_port
        return listen_host in {LOOPBACK, "localhost"}


def fixture_remote_path(root: Path, remote_path: str) -> Path:
    resolved_root = root.resolve()
    resolved = (resolved_root / remote_path.lstrip("/")).resolve()
    if resolved == resolved_root or resolved_root not in resolved.parents:
        raise ValueError("SCP path escaped fixture root")
    return resolved


async def handle_scp_upload(
    process: asyncssh.SSHServerProcess[bytes],
    root: Path,
    remote_path: str,
) -> None:
    destination = fixture_remote_path(root, remote_path)
    process.stdout.write(b"\0")
    await process.stdout.drain()
    header = await process.stdin.readline()
    if not header.startswith(b"C"):
        raise ValueError("Invalid SCP upload header")
    fields = header[1:].rstrip(b"\n").split(b" ", 2)
    if len(fields) != 3:
        raise ValueError("Invalid SCP upload metadata")
    size = int(fields[1])
    process.stdout.write(b"\0")
    await process.stdout.drain()
    payload = await process.stdin.readexactly(size)
    if await process.stdin.readexactly(1) != b"\0":
        raise ValueError("Invalid SCP upload completion")
    staged = destination.with_name(f".{destination.name}.part")
    staged.write_bytes(payload)
    staged.replace(destination)
    process.stdout.write(b"\0")
    await process.stdout.drain()
    process.stdout.write_eof()
    await process.stdin.read()


async def handle_scp_download(
    process: asyncssh.SSHServerProcess[bytes],
    root: Path,
    remote_path: str,
) -> None:
    source = fixture_remote_path(root, remote_path)
    payload = source.read_bytes()
    if await process.stdin.readexactly(1) != b"\0":
        raise ValueError("Invalid SCP download acknowledgement")
    process.stdout.write(f"C0644 {len(payload)} {source.name}\n".encode("ascii"))
    await process.stdout.drain()
    if await process.stdin.readexactly(1) != b"\0":
        raise ValueError("Invalid SCP metadata acknowledgement")
    process.stdout.write(payload)
    process.stdout.write(b"\0")
    await process.stdout.drain()
    if await process.stdin.readexactly(1) != b"\0":
        raise ValueError("Invalid SCP download completion")
    process.stdout.write_eof()
    await process.stdin.read()


async def handle_process(process: asyncssh.SSHServerProcess[bytes], sftp_root: Path) -> None:
    if process.command:
        if process.command == "fixture-info":
            process.stdout.write(b"SessionDock SSH integration fixture\n")
            process.exit(0)
        else:
            diagnostic_outputs = {
                "uname -a": b"Linux sessiondock-fixture 6.8.0 x86_64 GNU/Linux\n",
                "df -h": b"Filesystem      Size  Used Avail Use% Mounted on\nfixture          10G   1G    9G  10% /\n",
                "ip addr": b"1: lo: <LOOPBACK,UP> mtu 65536\n    inet 127.0.0.1/8 scope host lo\n",
                "show version": b"Arista vEOS 4.32.0F\nHardware version: 01.00\n",
                "show interfaces status": b"Port      Name  Status       Vlan\nEthernet1       connected    1\n",
                "show ip bgp summary": b"BGP summary information for VRF default\nNeighbor        V    AS MsgRcvd MsgSent State\n",
            }
            if process.command in diagnostic_outputs:
                process.stdout.write(diagnostic_outputs[process.command])
                process.exit(0)
                return
            command = shlex.split(process.command)
            if len(command) == 3 and command[:2] == ["scp", "-t"]:
                await handle_scp_upload(process, sftp_root, command[2])
                process.exit(0)
            elif len(command) == 3 and command[:2] == ["scp", "-f"]:
                await handle_scp_download(process, sftp_root, command[2])
                process.exit(0)
            else:
                process.stderr.write(b"Unsupported fixture command\n")
                process.exit(127)
        return

    process.stdout.write(b"SessionDock SSH integration fixture ready\r\n")
    while True:
        try:
            line = await process.stdin.readline()
        except asyncssh.TerminalSizeChanged:
            continue
        if not line:
            break
        if line.strip() in {b"exit", b"logout"}:
            break
        process.stdout.write(line)
    process.exit(0)


async def handle_echo(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while data := await reader.read(64 * 1024):
            writer.write(data)
            await writer.drain()
    finally:
        writer.close()
        await writer.wait_closed()


def listener_port(server: asyncio.AbstractServer) -> int:
    sockets = server.sockets
    if not sockets:
        raise RuntimeError("Fixture listener has no bound socket")
    return int(sockets[0].getsockname()[1])


def write_known_hosts(path: Path, ports: list[int], host_key: asyncssh.SSHKey) -> None:
    public_key = host_key.export_public_key("openssh").decode("ascii").strip()
    path.write_text(
        "".join(f"[{LOOPBACK}]:{port} {public_key}\n" for port in ports),
        encoding="ascii",
    )


def sessiondock_fingerprint(host_key: asyncssh.SSHKey) -> str:
    public_key = host_key.export_public_key("openssh").decode("ascii").split()
    digest = hashlib.sha256(base64.b64decode(public_key[1])).digest()
    return "SHA256:" + ":".join(f"{byte:02x}" for byte in digest)


async def open_fixture_connection(
    port: int,
    client_key_path: Path,
    known_hosts_path: Path,
    **kwargs: Any,
) -> asyncssh.SSHClientConnection:
    return await asyncssh.connect(
        LOOPBACK,
        port=port,
        username=USERNAME,
        client_keys=[str(client_key_path)],
        known_hosts=str(known_hosts_path),
        agent_path=None,
        **kwargs,
    )


async def check_echo(reader: Any, writer: Any) -> None:
    writer.write(PROBE)
    await writer.drain()
    response = await reader.readexactly(len(PROBE))
    if response != PROBE:
        raise RuntimeError("Tunnel echo response did not match the request")
    writer.close()
    await writer.wait_closed()


async def check_socks5(socks_port: int, echo_port: int) -> None:
    reader, writer = await asyncio.open_connection(LOOPBACK, socks_port)
    writer.write(b"\x05\x01\x00")
    await writer.drain()
    if await reader.readexactly(2) != b"\x05\x00":
        raise RuntimeError("SOCKS5 authentication negotiation failed")

    writer.write(
        b"\x05\x01\x00\x01"
        + bytes(int(part) for part in LOOPBACK.split("."))
        + echo_port.to_bytes(2, "big")
    )
    await writer.drain()
    header = await reader.readexactly(4)
    if header[:2] != b"\x05\x00":
        raise RuntimeError(f"SOCKS5 CONNECT failed with reply {header[1]}")

    address_length = {1: 4, 4: 16}.get(header[3])
    if header[3] == 3:
        address_length = (await reader.readexactly(1))[0]
    if address_length is None:
        raise RuntimeError("SOCKS5 returned an unsupported address type")
    await reader.readexactly(address_length + 2)
    await check_echo(reader, writer)


async def run_self_test(config: dict[str, Any]) -> None:
    unauthorized_key = asyncssh.generate_private_key("ssh-ed25519")
    try:
        unauthorized_connection = await asyncssh.connect(
            LOOPBACK,
            port=config["target_port"],
            username=USERNAME,
            client_keys=[unauthorized_key],
            known_hosts=config["known_hosts"],
            agent_path=None,
        )
    except asyncssh.PermissionDenied:
        pass
    else:
        unauthorized_connection.close()
        await unauthorized_connection.wait_closed()
        raise RuntimeError("Fixture accepted an unauthorized client key")

    target = await open_fixture_connection(
        config["target_port"],
        Path(config["client_key"]),
        Path(config["known_hosts"]),
    )
    try:
        result = await target.run("fixture-info", check=True)
        if "SessionDock" not in result.stdout:
            raise RuntimeError("SSH command probe returned unexpected output")

        async with target.start_sftp_client() as sftp:
            async with sftp.open("/probe.txt", "w") as remote_file:
                await remote_file.write(PROBE.decode("ascii"))
            async with sftp.open("/probe.txt", "r") as remote_file:
                if await remote_file.read() != PROBE.decode("ascii"):
                    raise RuntimeError("SFTP probe content did not round-trip")

        reader, writer = await target.open_connection(LOOPBACK, config["echo_port"])
        await check_echo(reader, writer)

        local_listener = await target.forward_local_port(
            LOOPBACK,
            0,
            LOOPBACK,
            config["echo_port"],
        )
        try:
            reader, writer = await asyncio.open_connection(
                LOOPBACK,
                local_listener.get_port(),
            )
            await check_echo(reader, writer)
        finally:
            local_listener.close()
            await local_listener.wait_closed()

        remote_listener = await target.forward_remote_port(
            LOOPBACK,
            0,
            LOOPBACK,
            config["echo_port"],
        )
        try:
            reader, writer = await asyncio.open_connection(
                LOOPBACK,
                remote_listener.get_port(),
            )
            await check_echo(reader, writer)
        finally:
            remote_listener.close()
            await remote_listener.wait_closed()

        socks_listener = await target.forward_socks(LOOPBACK, 0)
        try:
            await check_socks5(socks_listener.get_port(), config["echo_port"])
        finally:
            socks_listener.close()
            await socks_listener.wait_closed()

        try:
            await target.open_connection("example.invalid", 80)
        except asyncssh.ChannelOpenError:
            pass
        else:
            raise RuntimeError("Fixture allowed forwarding outside its loopback targets")
    finally:
        target.close()
        await target.wait_closed()

    jump = await open_fixture_connection(
        config["jump_port"],
        Path(config["client_key"]),
        Path(config["known_hosts"]),
    )
    try:
        tunneled_target = await open_fixture_connection(
            config["target_port"],
            Path(config["client_key"]),
            Path(config["known_hosts"]),
            tunnel=jump,
        )
        try:
            result = await tunneled_target.run("fixture-info", check=True)
            if "SessionDock" not in result.stdout:
                raise RuntimeError("ProxyJump probe returned unexpected output")
        finally:
            tunneled_target.close()
            await tunneled_target.wait_closed()
    finally:
        jump.close()
        await jump.wait_closed()


async def run_rust_smoke(config: dict[str, Any]) -> None:
    workspace = Path(__file__).resolve().parents[1]
    environment = os.environ.copy()
    environment.update(
        {
            "SESSIONDOCK_SSH_FIXTURE_HOST": config["host"],
            "SESSIONDOCK_SSH_FIXTURE_USERNAME": config["username"],
            "SESSIONDOCK_SSH_FIXTURE_TARGET_PORT": str(config["target_port"]),
            "SESSIONDOCK_SSH_FIXTURE_JUMP_PORT": str(config["jump_port"]),
            "SESSIONDOCK_SSH_FIXTURE_ECHO_PORT": str(config["echo_port"]),
            "SESSIONDOCK_SSH_FIXTURE_CLIENT_KEY": config["client_key"],
            "SESSIONDOCK_SSH_FIXTURE_KEY_TYPE": config["sessiondock_key_type"],
            "SESSIONDOCK_SSH_FIXTURE_FINGERPRINT": config[
                "sessiondock_fingerprint"
            ],
        }
    )
    tests = (
        "terminal::ssh_live_tests::live_direct_ssh_handshake_against_fixture",
        "terminal::ssh_live_tests::live_direct_ssh_auth_against_fixture",
        "terminal::ssh_live_tests::live_ssh_sftp_and_tunnels_against_fixture",
    )
    for test in tests:
        process = await asyncio.create_subprocess_exec(
            "cargo",
            "test",
            "--manifest-path",
            "src-tauri/Cargo.toml",
            test,
            "--",
            "--ignored",
            "--exact",
            "--nocapture",
            cwd=workspace,
            env=environment,
        )
        return_code = await process.wait()
        if return_code != 0:
            raise RuntimeError(f"Rust SSH smoke test {test} exited with code {return_code}")


async def run_fixture(self_test: bool, rust_smoke: bool, rust_smoke_runs: int) -> None:
    with tempfile.TemporaryDirectory(prefix="sessiondock-ssh-fixture-") as temp_dir:
        fixture_dir = Path(temp_dir)
        sftp_root = fixture_dir / "sftp-root"
        sftp_root.mkdir()

        host_key = asyncssh.generate_private_key("ssh-rsa", key_size=2048)
        client_key = asyncssh.generate_private_key("ecdsa-sha2-nistp256")
        client_public_key = client_key.convert_to_public()
        client_key_path = fixture_dir / "client_key"
        client_public_key_path = fixture_dir / "client_key.pub"
        known_hosts_path = fixture_dir / "known_hosts"
        client_key.write_private_key(client_key_path, "openssh")
        client_public_key.write_public_key(client_public_key_path)

        echo_server = await asyncio.start_server(handle_echo, LOOPBACK, 0)
        echo_port = listener_port(echo_server)
        allowed_ports = {echo_port}

        server_options = {
            "server_factory": lambda: FixtureSSHServer(client_public_key, allowed_ports),
            "server_host_keys": [host_key],
            "process_factory": lambda process: handle_process(process, sftp_root),
            "sftp_factory": lambda channel: asyncssh.SFTPServer(channel, chroot=sftp_root),
            "encoding": None,
            "kex_algs": ["ecdh-sha2-nistp256"],
        }
        target_server = await asyncssh.listen(LOOPBACK, 0, **server_options)
        target_port = target_server.get_port()
        allowed_ports.add(target_port)
        jump_server = await asyncssh.listen(LOOPBACK, 0, **server_options)
        jump_port = jump_server.get_port()
        allowed_ports.add(jump_port)

        write_known_hosts(known_hosts_path, [target_port, jump_port], host_key)
        config: dict[str, Any] = {
            "host": LOOPBACK,
            "username": USERNAME,
            "target_port": target_port,
            "jump_port": jump_port,
            "echo_port": echo_port,
            "client_key": str(client_key_path),
            "known_hosts": str(known_hosts_path),
            "sftp_root": str(sftp_root),
            "host_key_fingerprint": host_key.get_fingerprint("sha256"),
            "sessiondock_key_type": "Rsa",
            "sessiondock_fingerprint": sessiondock_fingerprint(host_key),
        }

        try:
            if self_test:
                await run_self_test(config)
                print("SSH fixture self-test passed", flush=True)
                return
            if rust_smoke:
                for run_number in range(1, rust_smoke_runs + 1):
                    await run_rust_smoke(config)
                    print(
                        f"SessionDock Rust SSH smoke test passed ({run_number}/{rust_smoke_runs})",
                        flush=True,
                    )
                return

            print(json.dumps(config, indent=2), flush=True)
            print("Press Ctrl+C to stop the fixture", flush=True)
            await asyncio.Event().wait()
        finally:
            jump_server.close()
            target_server.close()
            echo_server.close()
            await asyncio.gather(
                jump_server.wait_closed(),
                target_server.wait_closed(),
                echo_server.wait_closed(),
            )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the localhost-only SessionDock SSH integration fixture."
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--self-test",
        action="store_true",
        help="Verify SSH, ProxyJump, SFTP, remote forwarding, and SOCKS, then exit.",
    )
    mode.add_argument(
        "--rust-smoke",
        action="store_true",
        help="Run SessionDock's ignored Rust SSH/SFTP/tunnel smoke test, then exit.",
    )
    parser.add_argument(
        "--rust-smoke-runs",
        type=int,
        default=1,
        metavar="COUNT",
        help="Run the Rust smoke test COUNT times against one fixture (default: 1).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.rust_smoke_runs < 1:
        raise SystemExit("--rust-smoke-runs must be at least 1")
    if args.rust_smoke_runs != 1 and not args.rust_smoke:
        raise SystemExit("--rust-smoke-runs requires --rust-smoke")
    try:
        asyncio.run(
            run_fixture(args.self_test, args.rust_smoke, args.rust_smoke_runs)
        )
    except KeyboardInterrupt:
        pass
    except (OSError, asyncssh.Error, RuntimeError) as error:
        raise SystemExit(f"SSH fixture failed: {error}") from error


if __name__ == "__main__":
    main()