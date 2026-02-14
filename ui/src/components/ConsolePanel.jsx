import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { getTerminalWsUrl } from "../api";

export default function ConsolePanel() {
    const containerRef = useRef(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const term = new Terminal({
            cursorBlink: true,
            fontSize: 13,
            fontFamily: "'IBM Plex Mono', 'Menlo', monospace",
            theme: {
                background: "#ffffff",
                foreground: "#0a0a0a",
                cursor: "#0a0a0a",
                cursorAccent: "#ffffff",
                selectionBackground: "#e5e5e5",
                selectionForeground: "#0a0a0a",
                black: "#0a0a0a",
                red: "#dc2626",
                green: "#16a34a",
                yellow: "#ca8a04",
                blue: "#2563eb",
                magenta: "#9333ea",
                cyan: "#0891b2",
                white: "#fafafa",
                brightBlack: "#737373",
                brightRed: "#ef4444",
                brightGreen: "#22c55e",
                brightYellow: "#eab308",
                brightBlue: "#3b82f6",
                brightMagenta: "#a855f7",
                brightCyan: "#06b6d4",
                brightWhite: "#ffffff",
            },
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(new WebLinksAddon());
        term.open(containerRef.current);
        fitAddon.fit();

        // Connect WebSocket
        const url = getTerminalWsUrl();
        const ws = new WebSocket(url);

        ws.onopen = () => {
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
        <div
            ref={containerRef}
            className="flex-1 p-2"
        />
    );
}
