export function log(status, message, data = {}) {
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    status,
    message,
    data
  }));
}