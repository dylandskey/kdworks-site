// Receives the interest form, emails the KD Works team, and sends the
// person a confirmation. Email is sent through Resend (RESEND_API_KEY).
// Settings live in Vercel > Project > Settings > Environment Variables:
//   RESEND_API_KEY  (required)   TEAM_TO / FROM_ADDRESS (optional overrides)
const TEAM_TO = process.env.TEAM_TO || "survey@kdworksllc.com";
const FROM = process.env.FROM_ADDRESS || "KD Works <info@kdworksllc.com>";
const REPLY_TO = "info@kdworksllc.com";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clean = (s, n) => String(s == null ? "" : s).replace(/[\r\n]+/g, " ").trim().slice(0, n);

async function send(key, body) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Resend " + r.status + " " + (await r.text()).slice(0, 200));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ success: false }); }
  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(500).json({ success: false, message: "not configured" });

  let d = req.body;
  if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { d = null; } }
  if (!d || typeof d !== "object") return res.status(400).json({ success: false });

  const name = clean(d.name, 120), email = clean(d.email, 160), org = clean(d.Organization, 120);
  if (!name || !org || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ success: false, message: "missing contact details" });

  // Everything except the plumbing fields is an answer, in the order sent.
  const skip = { access_key: 1, subject: 1, from_name: 1, botcheck: 1, name: 1, email: 1, Organization: 1 };
  const rows = [["Name", name], ["Email", email], ["Organization", org]];
  Object.keys(d).forEach((k) => { if (!skip[k]) rows.push([clean(k, 300), String(d[k]).slice(0, 3000)]); });
  if (rows.length > 60) rows.length = 60;

  const text = rows.map((r) => r[0] + "\n" + r[1]).join("\n\n");
  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1b1b1b">' +
    rows.map((r) => '<p style="margin:0 0 14px"><strong>' + esc(r[0]) + "</strong><br>" + esc(r[1]).replace(/\n/g, "<br>") + "</p>").join("") + "</div>";

  try {
    await send(key, { from: FROM, to: [TEAM_TO], reply_to: email, subject: "KD Works interest form: " + org + " (" + name + ")", text, html });
  } catch (e) {
    console.error(e.message);
    return res.status(502).json({ success: false });
  }

  // Confirmation to the person. A failure here must not lose the submission.
  const first = esc(name.split(" ")[0]);
  try {
    await send(key, {
      from: FROM, to: [email], reply_to: REPLY_TO,
      subject: "We got your note, thanks",
      text: "Hi " + name.split(" ")[0] + ",\n\nThanks for your interest in KD Works. We received your form and will review it and get back to you soon.\n\nIf you want to add anything, just reply to this email.\n\nKD Works\nkdworksllc.com",
      html: '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#1b1b1b"><p>Hi ' + first + ",</p><p>Thanks for your interest in KD Works. We received your form and will review it and get back to you soon.</p><p>If you want to add anything, just reply to this email.</p><p>KD Works<br><a href=\"https://kdworksllc.com\">kdworksllc.com</a></p></div>",
    });
  } catch (e) { console.error("confirmation failed: " + e.message); }

  return res.status(200).json({ success: true });
};
