# Platform notes

The UI and API are portable Node.js code, while the first probe implementation uses Unix command paths. On macOS and Linux, the server expects `ping`, `traceroute`, `netstat`, and `ifconfig` at the paths shown below.

| Capability | Current command | Windows equivalent to consider |
| --- | --- | --- |
| ICMP probe | `/sbin/ping -c 1 -W 1000 <host>` | `ping -n 1 -w 1000 <host>` |
| Route trace | `/usr/sbin/traceroute -m 12 -w 1 <host>` | `tracert -d -h 12 -w 1000 <host>` |
| Default route | `/usr/sbin/netstat -rn -f inet` | `route print -4` or PowerShell `Get-NetRoute` |
| Interfaces | `/sbin/ifconfig` | `Get-NetAdapter` or `ipconfig /all` |

Adding platform branches should preserve the normalized `LatencySample`, `TracerouteResult`, and `NetworkStatus` shapes in [`src/shared/types.ts`](../src/shared/types.ts). Parser fixtures are kept close to the implementation in `server/*.test.ts`.
