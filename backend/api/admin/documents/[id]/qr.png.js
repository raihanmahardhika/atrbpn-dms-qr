import QRCode from "qrcode";

/**
 * GET /api/admin/documents/:id/qr.png
 * Menghasilkan PNG QR yang berisi deep-link ke halaman dokumen di frontend.
 */
export default async function handler(req, res) {
  try {
    const { id } = req.query;
    if (!id) {
      res.status(400).json({ error: "Missing document id" });
      return;
    }

    const deeplink = `https://atrbpn-dms.web.app/document/${id}`;
    const png = await QRCode.toBuffer(deeplink, { type: "png", margin: 1, scale: 8 });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(png);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "QR generate failed" });
  }
}
