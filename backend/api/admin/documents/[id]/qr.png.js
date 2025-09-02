// QR PNG generator - deep link ke web app
import QRCode from "qrcode";

export default async function handler(req, res) {
  const { id } = req.query;

  // Ambil URL frontend dari ENV (set di Vercel), fallback ke domain Firebase kamu
  const WEB_URL =
    process.env.WEB_URL ||
    process.env.FRONTEND_URL ||
    (process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",")[0] : null) ||
    "https://atrbpn-dms.web.app";

  const base = WEB_URL.replace(/\/$/, ""); // pastikan tanpa slash di akhir
  const payload = `${base}/documents/${id}`; // <<— deep-link yang di-scan kamera

  const buf = await QRCode.toBuffer(payload, { type: "png", margin: 1, width: 512 });

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.status(200).send(buf);
}
