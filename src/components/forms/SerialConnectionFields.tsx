import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { listSerialPorts } from "../../api/commands";
import type { SerialPortInfo } from "../../types";

export const SERIAL_BAUD_RATES = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

interface SerialConnectionFieldsProps {
  portName: string;
  baudRate: number;
  onPortNameChange: (portName: string) => void;
  onBaudRateChange: (baudRate: number) => void;
}

export function SerialConnectionFields({
  portName,
  baudRate,
  onPortNameChange,
  onBaudRateChange,
}: SerialConnectionFieldsProps) {
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refreshPorts = async () => {
    setLoading(true);
    setError("");
    try {
      const availablePorts = await listSerialPorts();
      setPorts(availablePorts);
      if (!portName && availablePorts.length > 0) onPortNameChange(availablePorts[0].name);
    } catch (cause) {
      setError(`Unable to list serial ports: ${String(cause)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshPorts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const knownPort = ports.some((port) => port.name === portName);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="block text-xs text-dock-text-muted" htmlFor="serial-port-name">COM port</label>
          <button
            type="button"
            onClick={() => void refreshPorts()}
            disabled={loading}
            className="inline-flex items-center gap-1 text-[11px] text-dock-accent hover:text-dock-accent-hover disabled:opacity-50"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
        <select
          id="serial-port-name"
          value={knownPort ? portName : "manual"}
          onChange={(event) => onPortNameChange(event.target.value === "manual" ? "" : event.target.value)}
          className="w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text focus:border-dock-accent focus:outline-none"
        >
          {ports.map((port) => (
            <option key={port.name} value={port.name}>{port.name} - {port.port_type}</option>
          ))}
          <option value="manual">Enter port manually...</option>
        </select>
        {!knownPort && (
          <input
            type="text"
            value={portName}
            onChange={(event) => onPortNameChange(event.target.value)}
            placeholder="COM3"
            required
            className="mt-2 w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text placeholder-dock-text-muted focus:border-dock-accent focus:outline-none"
          />
        )}
        {error && <p className="mt-1 text-[11px] text-dock-error">{error}</p>}
        {!loading && !error && ports.length === 0 && <p className="mt-1 text-[11px] text-dock-text-muted">No ports detected. Enter a COM port manually.</p>}
      </div>

      <div>
        <label className="block text-xs text-dock-text-muted mb-1.5" htmlFor="serial-baud-rate">Speed (bps)</label>
        <select
          id="serial-baud-rate"
          value={baudRate}
          onChange={(event) => onBaudRateChange(Number(event.target.value))}
          className="w-full px-3 py-2 rounded bg-dock-bg border border-dock-border text-xs text-dock-text focus:border-dock-accent focus:outline-none"
        >
          {SERIAL_BAUD_RATES.map((rate) => <option key={rate} value={rate}>{rate.toLocaleString()}</option>)}
        </select>
      </div>
    </div>
  );
}