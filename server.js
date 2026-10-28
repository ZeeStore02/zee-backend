const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const FIREBASE_URL = "https://token-pengguna-default-rtdb.asia-southeast1.firebasedatabase.app";

app.get('/', (req, res) => res.send("Server ZEE STORE Active"));

// WEBHOOK SAWERIA (Menerima pembayaran)
app.post('/api/saweria-webhook', async (req, res) => {
    try {
        const { amount_raw, donator_name } = req.body;
        const nominal = parseInt(amount_raw);

        if (nominal >= 10000 && donator_name) {
            const totalHari = Math.floor(nominal / 10000) * 30;
            const expDate = new Date();
            expDate.setDate(expDate.getDate() + totalHari);

            const tokenName = "ZEE_P" + Math.random().toString(36).substring(2, 7).toUpperCase();
            const cleanName = donator_name.trim().toLowerCase();

            // Simpan Token berdasarkan Nama Pembeli
            await axios.put(`${FIREBASE_URL}/buyers/${cleanName}.json`, {
                token: tokenName,
                status: "premium",
                expired: expDate.toISOString().split('T')[0]
            });

            await axios.put(`${FIREBASE_URL}/tokens/${tokenName}.json`, {
                status: "premium",
                expired: expDate.toISOString().split('T')[0]
            });
        }
        return res.status(200).json({ status: "success" });
    } catch (error) {
        return res.status(500).send("Error");
    }
});

// ENDPOINT CEK TOKEN OTOMATIS
app.post('/api/check-token', async (req, res) => {
    const { buyerName } = req.body;
    if (!buyerName) return res.status(400).json({ success: false, message: "Masukkan nama!" });

    try {
        const cleanName = buyerName.trim().toLowerCase();
        const checkRes = await axios.get(`${FIREBASE_URL}/buyers/${cleanName}.json`);
        
        if (checkRes.data && checkRes.data.token) {
            return res.json({
                success: true,
                token: checkRes.data.token,
                expired: checkRes.data.expired
            });
        } else {
            return res.status(404).json({ success: false, message: "Token belum ditemukan. Pastikan pembayaran Saweria sudah lunas!" });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: "Gagal cek database." });
    }
});

// ENDPOINT KLAIM FREE (Fix untuk data lama & data baru)
app.post('/api/claim-free', async (req, res) => {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: "Device ID tidak ditemukan!" });

    try {
        const checkRes = await axios.get(`${FIREBASE_URL}/free_claims/${deviceId}.json`);
        const now = new Date();

        if (checkRes.data && checkRes.data.last_claimed) {
            const diffDays = Math.floor((now - new Date(checkRes.data.last_claimed)) / (1000 * 60 * 60 * 24));
            
            if (diffDays < 30) {
                let savedToken = checkRes.data.token;
                let savedExpired = checkRes.data.expired;

                // JIKA DATA LAMA (belum ada field token di free_claims):
                if (!savedToken) {
                    // Cari token dari daftar /tokens/ yang berstatus "free"
                    const allTokensRes = await axios.get(`${FIREBASE_URL}/tokens.json`);
                    if (allTokensRes.data) {
                        const freeTokens = Object.entries(allTokensRes.data).filter(([key, val]) => val.status === "free");
                        if (freeTokens.length > 0) {
                            // Ambil token free terakhir
                            const lastToken = freeTokens[freeTokens.length - 1];
                            savedToken = lastToken[0];
                            savedExpired = lastToken[1].expired;

                            // Update balik ke /free_claims/ biar data selanjutnya lengkap
                            await axios.patch(`${FIREBASE_URL}/free_claims/${deviceId}.json`, {
                                token: savedToken,
                                expired: savedExpired
                            });
                        }
                    }
                }

                return res.json({
                    success: true,
                    isAlreadyClaimed: true,
                    token: savedToken || "ZEE_FREE_OLD",
                    expired: savedExpired || "12 Hari",
                    message: `Sudah klaim! Tunggu ${30 - diffDays} hari lagi.`
                });
            }
        }

        // KLAIM BARU (Jika belum pernah klaim atau sudah > 30 hari)
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + 12);
        const expiredFormatted = expDate.toISOString().split('T')[0];
        const tokenFreeName = "ZEE_FREE_" + Math.random().toString(36).substring(2, 6).toUpperCase();

        await axios.put(`${FIREBASE_URL}/tokens/${tokenFreeName}.json`, { 
            status: "free", 
            expired: expiredFormatted 
        });
        
        await axios.put(`${FIREBASE_URL}/free_claims/${deviceId}.json`, { 
            last_claimed: now.toISOString(),
            token: tokenFreeName,
            expired: expiredFormatted
        });

        return res.json({ 
            success: true, 
            isAlreadyClaimed: false,
            token: tokenFreeName, 
            expired: expiredFormatted 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT);
