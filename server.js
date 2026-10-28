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

// ENDPOINT KLAIM FREE (Masa Aktif Token 12 Hari, Batas Klaim 30 Hari)
app.post('/api/claim-free', async (req, res) => {
    const { deviceId, savedToken } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: "Device ID tidak ditemukan!" });

    try {
        const checkRes = await axios.get(`${FIREBASE_URL}/free_claims/${deviceId}.json`);
        const now = new Date();

        // 1. CEK BATASAN KLAIM 1X SEBULAN (30 HARI)
        if (checkRes.data && checkRes.data.last_claimed) {
            const diffDays = Math.floor((now - new Date(checkRes.data.last_claimed)) / (1000 * 60 * 60 * 24));
            
            if (diffDays < 30) { // Batas klaim tetap 30 hari
                let savedTokenName = checkRes.data.token || savedToken;
                let savedExpired = checkRes.data.expired;

                // Jika data token lama belum ada, buatkan otomatis
                if (!savedTokenName) {
                    savedTokenName = "ZEE_FREE_" + Math.random().toString(36).substring(2, 7).toUpperCase();
                    
                    // Hitung expired 12 hari dari saat pertama kali klaim
                    const expDate = new Date(checkRes.data.last_claimed);
                    expDate.setDate(expDate.getDate() + 12);
                    savedExpired = expDate.toISOString().split('T')[0];

                    await axios.put(`${FIREBASE_URL}/tokens/${savedTokenName}.json`, { status: "free", expired: savedExpired });
                    await axios.patch(`${FIREBASE_URL}/free_claims/${deviceId}.json`, { token: savedTokenName, expired: savedExpired });
                }

                return res.json({
                    success: true,
                    isAlreadyClaimed: true,
                    token: savedTokenName,
                    expired: savedExpired,
                    message: `Sudah klaim! Tunggu ${30 - diffDays} hari lagi untuk klaim berikutnya.`
                });
            }
        }

        // 2. KLAIM BARU (MASA AKTIF TOKEN 12 HARI)
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + 12); // Token aktif 12 hari
        const expiredFormatted = expDate.toISOString().split('T')[0];
        const tokenFreeName = "ZEE_FREE_" + Math.random().toString(36).substring(2, 7).toUpperCase();

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
