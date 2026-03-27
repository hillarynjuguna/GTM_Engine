export async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const data = await response.json();
  if (!response.ok) {
    const detail = data.details ? ` ${data.details}` : '';
    const error = new Error(`${data.message || 'Request failed.'}${detail}`.trim());
    error.data = data;
    throw error;
  }
  return data;
}
