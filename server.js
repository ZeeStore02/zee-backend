const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const FIREBASE_URL = "https://token-pengguna-default-rtdb.asia-southeast1.firebasedatabase.app";

app.get('/', (req, res) => {
    res.send("Server ZEE STORE Backend Saweria Aktif!");
});

// WEBHOOK SAWERIA OTOMATIS
app.post('/api/saweria-webhook', async (req, res) => {
    try {
        const { amount_raw, donator_name } = req.body;
        const nominal = parseInt(amount_raw);

        // Minimal pembayaran Rp 10.000 (Kelipatan 10rb = 30 Hari)
        if (nominal >= 10000) {
            const totalHari = Math.floor(nominal / 10000) * 30;
            const expDate = new Date();
            expDate.setDate(expDate.getDate() + totalHari);

            const tokenName = "ZEE_P" + Math.random().toString(36).substring(2, 7).toUpperCase();

            // Simpan token baru ke Firebase Database
            await axios.put(`${FIREBASE_URL}/tokens/${tokenName}.json`, {
                status: "premium",
                expired: expDate.toISOString().split('T')[0],
                buyer: donator_name || "Pembeli Saweria"
            });

            console.log(`[SAWERIA SUCCESS] Token ${tokenName} berhasil dibuat untuk ${donator_name}`);
        }

        return res.status(200).json({ status: "success" });
    } catch (error) {
        console.error("Saweria Webhook Error:", error.message);
        return res.status(500).send("Internal Server Error");
    }
});

// ENDPOINT KLAIM TOKEN FREE (TETAP SAMA)
app.post('/api/claim-free', async (req, res) => {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: "Device ID tidak ditemukan!" });

    try {
        const checkRes = await axios.get(`${FIREBASE_URL}/free_claims/${deviceId}.json`);
        const claimData = checkRes.data;
        const now = new Date();

        if (claimData && claimData.last_claimed) {
            const lastClaimedDate = new Date(claimData.last_claimed);
            const diffDays = Math.floor((now - lastClaimedDate) / (1000 * 60 * 60 * 24));

            if (diffDays < 30) {
                return res.status(400).json({ success: false, message: `Device ini sudah klaim! Tunggu ${30 - diffDays} hari lagi.` });
            }
        }

        const expDate = new Date();
        expDate.setDate(expDate.getDate() + 12);
        const expiredFormatted = expDate.toISOString().split('T')[0];
        const tokenFreeName = "ZEE_FREE_" + Math.random().toString(36).substring(2, 6).toUpperCase();

        await axios.put(`${FIREBASE_URL}/tokens/${tokenFreeName}.json`, { status: "free", expired: expiredFormatted });
        await axios.put(`${FIREBASE_URL}/free_claims/${deviceId}.json`, { last_claimed: now.toISOString() });

        return res.json({ success: true, token: tokenFreeName, expired: expiredFormatted });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server ZEE STORE aktif`));
