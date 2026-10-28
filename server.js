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

// ENDPOINT KLAIM FREE (Disesuaikan agar menampilkan token lama saat ditolak 30 hari)
app.post('/api/claim-free', async (req, res) => {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: "Device ID tidak ditemukan!" });

    try {
        const checkRes = await axios.get(`${FIREBASE_URL}/free_claims/${deviceId}.json`);
        const now = new Date();

        // 1. Jika deviceId sudah ada dan belum lewat 30 hari
        if (checkRes.data && checkRes.data.last_claimed) {
            const diffDays = Math.floor((now - new Date(checkRes.data.last_claimed)) / (1000 * 60 * 60 * 24));
            
            if (diffDays < 30) {
                // Kembalikan token lama dan status isAlreadyClaimed: true
                return res.json({
                    success: true,
                    isAlreadyClaimed: true,
                    token: checkRes.data.token || "Klaim Aktif",
                    expired: checkRes.data.expired || "Terdaftar",
                    message: `Sudah klaim! Tunggu ${30 - diffDays} hari lagi.`
                });
            }
        }

        // 2. Jika belum pernah klaim ATAU sudah lewat 30 hari
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + 12);
        const expiredFormatted = expDate.toISOString().split('T')[0];
        const tokenFreeName = "ZEE_FREE_" + Math.random().toString(36).substring(2, 6).toUpperCase();

        // Simpan token baru ke node /tokens/ dan simpan detail klaim + token ke node /free_claims/
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
