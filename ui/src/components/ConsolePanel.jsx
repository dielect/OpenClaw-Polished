import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { getTerminalWsUrl } from "../api";

export default function ConsolePanel() {
    const containerRef = useRef(null);
    const termRef = useRef(null);
    const wsRef = useRef(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const term = new Terminal({
            cursorBlink: true,
            fontSize: 13,
            fontFamily: "'IBM Plex Mono', 'Menlo', monospace",
            theme: {
                background: "#09090b",
                foreground: "#fafafa",
                cursor: "#fafafa",
                selectionBackground: "#27272a",
                black: "#09090b",
                red: "#ef4444",
                green: "#22c55e",
                yellow: "#eab308",
                blue: "#3b82f6",
                magenta: "#a855f7",
                cyan: "#06b6d4",
                white: "#fafafa",
            },
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(new WebLinksAddon());
        term.open(containerRef.current);
        fitAddon.fit();
        termRef.current = term;

        // Connect WebSocket
        const url = getTerminalWsUrl();
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            // Send initial size
            ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        };

        ws.onmessage = (e) => {
            term.write(e.data);
        };

        ws.onclose = () => {
            term.write("\r\n\x1b[90m[Connection closed]\x1b[0m\r\n");
        };

        ws.onerror = () => {
            term.write("\r\n\x1b[31m[Connection error]\x1b[0m\r\n");
        };

        term.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });

        // Handle resize
        const onResize = () => {
            fitAddon.fit();
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
            }
        };

        const resizeObserver = new ResizeObserver(onResize);
        resizeObserver.observe(containerRef.current);

        return () => {
            resizeObserver.disconnect();
            ws.close();
            term.dispose();
        };
    }, []);

    return (
        <div className="h-[calc(100vh-7rem)] flex flex-col">
            <div className="mb-3">
                <p className="text-sm text-muted-foreground">
                    Interactive terminal session. Run <code className="bg-muted px-1 rounded text-xs">openclaw</code> commands directly.
                </p>
            </div>
            <div
                ref={containerRef}
                className="flex-1 rounded-lg border border-border overflow-hidden bg-[#09090b] p-1"
            />
        </div>
    );
}
