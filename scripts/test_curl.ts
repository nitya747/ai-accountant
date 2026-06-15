async function test() {
  console.log("Sending POST request to /api/chat...");
  try {
    const res = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: "cmqeo1yge0001vsuyfnkf5ge9",
        messages: [
          {
            role: "user",
            parts: [
              {
                type: "text",
                text: "hi",
              },
            ],
          },
        ],
      }),
    });

    console.log("Response Status:", res.status);
    const reader = res.body?.getReader();
    if (!reader) {
      console.log("No response body reader available.");
      return;
    }

    const decoder = new TextDecoder();
    let count = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      count++;
      if (count <= 10) {
        console.log(`Chunk #${count}:`, JSON.stringify(text));
      }
    }
    console.log("Total chunks received:", count);
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

test();
