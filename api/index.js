export default function handler(req, res) {
  res.status(200).send(`
    <html>
      <head>
        <title>Prodo Mentor Backend</title>
        <style>
          body { font-family: Arial, sans-serif; background: #18181b; color: #fafafa; text-align: center; padding: 60px; }
          h1 { font-size: 2.5rem; margin-bottom: 0.5em; }
          p { font-size: 1.2rem; color: #a1a1aa; }
          .status { margin-top: 2em; font-size: 1.1rem; color: #22c55e; }
        </style>
      </head>
      <body>
        <h1>🚀 Prodo Mentor Backend</h1>
        <p>Welcome! This is the API server for Prodo Mentor.<br>
        Use the documented endpoints for integration with GitHub, RAG, and more.</p>
        <div class="status">Server is running and ready to accept requests.</div>
      </body>
    </html>
  `);
}
