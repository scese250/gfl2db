export async function onRequest(context) {
  const url = new URL(context.request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // Only allow proxying Google Docs/Sheets URLs
  if (!targetUrl.startsWith('https://docs.google.com/spreadsheets/')) {
    return new Response('Invalid URL', { status: 403 });
  }

  try {
    const response = await fetch(targetUrl);

    if (!response.ok) {
      return new Response('Failed to fetch', { status: response.status });
    }

    const body = await response.text();

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/html',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response('Proxy error', { status: 500 });
  }
}
