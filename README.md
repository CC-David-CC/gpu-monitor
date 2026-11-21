# GPU Monitor

System Tools → GPU Monitor shows the latest GPU sample and compute queue totals. Opening a window requests the current sample. Every refresh replaces that sample. The gateway shares one snapshot for 20 seconds across signed-in viewers. The sampler keeps only its latest reading in the user runtime directory. Queue records used to deliver jobs are separate from telemetry.

Each machine runs the user unit `webos-gpu-monitor.service`. Use `systemctl --user status|start|stop webos-gpu-monitor.service` with the desired action. An enabled unit starts with that user's systemd manager. Collection uses the installed NVIDIA tools or AMD sysfs counters. Unknown model or precision is displayed explicitly. Queue counts cover the connected WebOS inference coordinator.

Set `WEBOS_GPU_MONITOR=1` on the WebOS backend. Its service identity needs host-key-verified access to read the four fixed telemetry reports. Clients receive GPU metrics and model labels without process arguments, account IDs, or prompts. The app exposes no machine control.
