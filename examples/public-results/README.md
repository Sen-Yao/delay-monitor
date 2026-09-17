# Public result example

This folder contains a publication-safe aggregate generated from a local monitoring dataset. It is intended to show the output shape and the kind of latency pattern the application can reveal, while keeping the original network private.

The summary has been redacted and rounded before publication:

- endpoint IDs and addresses are replaced with generic labels;
- raw samples, incident payloads, route hops, interface names, and session IDs are omitted;
- sample counts are independently rounded to the nearest hundred and latency values to one decimal place;
- the result has no wall-clock timestamps or device, SSID, ISP, or account identifiers.

The values are observational. They are useful for demonstrating relative behavior and tail latency, but they are not a benchmark or a diagnosis of a particular provider.

Successful RTTs alone contribute to the mean, nearest-rank p95, and maximum. Disabled samples are excluded from sample totals and failure counts; probe errors are not proof of network packet loss. Target addresses changed during collection, so a target label does not identify a fixed endpoint or hop. The incident counts are exact counts of the latest 300 retained records, not a complete history. Rounded sample columns need not sum exactly.
