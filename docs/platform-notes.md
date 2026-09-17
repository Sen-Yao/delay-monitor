# Platform notes

The UI and API use Node.js, while native diagnostics currently use macOS command paths and arguments. Linux is not yet supported end to end: executable locations, `ping -W` units, route output, and installed interface utilities can differ. Windows needs native command branches and parser fixtures as well.

| Capability | Current command | Windows equivalent to consider |
| --- | --- | --- |
| ICMP probe | `/sbin/ping -c 1 -W 1000 <host>` | `ping -n 1 -w 1000 <host>` |
| Route trace | `/usr/sbin/traceroute -m 12 -w 1 <host>` | `tracert -d -h 12 -w 1000 <host>` |
| Default route | `/usr/sbin/netstat -rn -f inet` | `route print -4` or PowerShell `Get-NetRoute` |
| Interfaces | `/sbin/ifconfig` | `Get-NetAdapter` or `ipconfig /all` |

Adding platform branches should preserve the normalized `LatencySample`, `TracerouteResult`, and `NetworkStatus` shapes in [`src/shared/types.ts`](../src/shared/types.ts). Parser fixtures are kept close to the implementation in `server/*.test.ts`.
