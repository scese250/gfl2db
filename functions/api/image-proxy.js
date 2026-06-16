export async function onRequest(context) {
  const url = new URL(context.request.url);
  const imageUrl = url.searchParams.get('url');

  if (!imageUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // Only allow proxying Google Sheets image URLs
  if (!imageUrl.startsWith('https://docs.google.com/sheets-images-rt/')) {
    return new Response('Invalid URL', { status: 403 });
  }

  try {
    const response = await fetch(imageUrl, {
      headers: {
        'Referer': 'https://docs.google.com/',
      },
    });

    if (!response.ok) {
      return new Response('Failed to fetch image', { status: response.status });
    }

    const imageData = await response.arrayBuffer();
    const contentType = response.headers.get('Content-Type') || 'image/png';

    return new Response(imageData, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response('Proxy error', { status: 500 });
  }
}
