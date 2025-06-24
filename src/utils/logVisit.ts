export async function logVisit() {
  try {
    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();

    const response = await fetch('/api/log-traffic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ country: data.country_name }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error("logVisit error:", err);
    }
  } catch (error) {
    console.error("logVisit exception:", error);
  }
}
