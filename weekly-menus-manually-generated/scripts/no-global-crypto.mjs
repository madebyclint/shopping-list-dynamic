// Reproduce a pre-Node-19 runtime without installing an old Node.
//
// Node < 19 has no `globalThis.crypto`, so a bare `crypto.randomUUID()` throws
// "ReferenceError: crypto is not defined". The MCP SDK's streamable-HTTP
// transport does exactly that when it opens a response stream, which made every
// `initialize` fail with a 400 while OAuth kept working — the bug that took a
// while to find because it does not reproduce on a modern local Node.
//
// Usage:  node --import ./scripts/no-global-crypto.mjs server.mjs
//
// Deleting the property (rather than assigning undefined or a throwing getter)
// is what makes a bare reference an actual ReferenceError, matching Node 18.
delete globalThis.crypto;

if (typeof globalThis.crypto !== 'undefined') {
  console.error('⚠️  could not remove globalThis.crypto — simulation is not faithful');
} else {
  console.error('🧪 simulating Node < 19: globalThis.crypto removed');
}
