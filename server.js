const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());

// LIMIT 5MB AGAR BISA TERIMA FOTO BASE64 DARI FRONTEND
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

// Hapus garis miring di akhir agar tidak terjadi double slash (//)
const FIREBASE_URL = "https://keypengguna-default-rtdb.asia-southeast1.firebasedatabase.app";

// Bersihkan karakter yang dilarang Firebase (. $ # [ ] /)
function sanitizeKey(str) {
    return str.trim().toLowerCase().replace(/[.#$\[\]\/]/g, '_');
}

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
            const cleanName = sanitizeKey(donator_name);
            const expiredDateStr = expDate.toISOString().split('T')[0];

            // Simpan Token berdasarkan Nama Pembeli
            await axios.put(`${FIREBASE_URL}/buyers/${cleanName}.json`, {
                token: tokenName,
                status: "premium",
                expired: expiredDateStr
            });

            await axios.put(`${FIREBASE_URL}/tokens/${tokenName}.json`, {
                status: "premium",
                expired: expiredDateStr
            });
        }
        return res.status(200).json({ status: "success" });
    } catch (error) {
        console.error("Webhook Error:", error.message);
        return res.status(500).json({ status: "error", message: error.message });
    }
});

// ENDPOINT CEK TOKEN OTOMATIS (DENGAN KUNCI DEVICE ID PERMANEN)
app.post('/api/check-token', async (req, res) => {
    const { buyerName, deviceId } = req.body;
    
    if (!buyerName) return res.status(400).json({ success: false, message: "Masukkan nama pembeli!" });
    if (!deviceId) return res.status(400).json({ success: false, message: "Device ID tidak terdeteksi!" });

    try {
        const cleanName = sanitizeKey(buyerName);
        const checkRes = await axios.get(`${FIREBASE_URL}/buyers/${cleanName}.json`);
        
        // 1. Cek Apakah Transaksi Ada di Firebase
        if (!checkRes.data || !checkRes.data.token) {
            return res.status(404).json({ 
                success: false, 
                message: "Token belum ditemukan. Pastikan pembayaran Saweria sudah lunas dan nama sesuai!" 
            });
        }

        const buyerData = checkRes.data;

        // 2. Jika Token Belum Terikat ke Device ID Mana Pun (Klaim Pertama Kali)
        if (!buyerData.deviceId) {
            await axios.patch(`${FIREBASE_URL}/buyers/${cleanName}.json`, {
                deviceId: deviceId
            });

            return res.json({
                success: true,
                token: buyerData.token,
                expired: buyerData.expired
            });
        }

        // 3. Jika Sudah Terikat, Cocokkan Device ID
        if (buyerData.deviceId === deviceId) {
            return res.json({
                success: true,
                token: buyerData.token,
                expired: buyerData.expired
            });
        } else {
            return res.status(403).json({ 
                success: false, 
                message: "Akses Ditolak! Nama pembeli ini sudah terikat pada perangkat lain." 
            });
        }

    } catch (err) {
        res.status(500).json({ success: false, message: "Gagal terhubung ke database." });
    }
});

// ENDPOINT KLAIM FREE (Fixed Token Konsisten)
app.post('/api/claim-free', async (req, res) => {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: "Device ID tidak ditemukan!" });

    try {
        const cleanDeviceId = sanitizeKey(deviceId);
        const checkRes = await axios.get(`${FIREBASE_URL}/free_claims/${cleanDeviceId}.json`);
        const now = new Date();

        // 1. CEK BAHWA PERANGKAT SUDAH PERNAH KLAIM & BATAS 30 HARI
        if (checkRes.data && checkRes.data.last_claimed) {
            const lastClaimedDate = new Date(checkRes.data.last_claimed);
            const diffDays = Math.floor((now - lastClaimedDate) / (1000 * 60 * 60 * 24));
            
            if (diffDays < 30) {
                let savedTokenName = checkRes.data.token;
                let savedExpired = checkRes.data.expired;

                if (!savedTokenName) {
                    savedTokenName = "ZEE_FREE_" + Math.random().toString(36).substring(2, 7).toUpperCase();
                    const expDate = new Date(lastClaimedDate);
                    expDate.setDate(expDate.getDate() + 12);
                    savedExpired = expDate.toISOString().split('T')[0];

                    await axios.put(`${FIREBASE_URL}/tokens/${savedTokenName}.json`, { status: "free", expired: savedExpired });
                    await axios.patch(`${FIREBASE_URL}/free_claims/${cleanDeviceId}.json`, { token: savedTokenName, expired: savedExpired });
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

        // 2. KLAIM BARU (JIKA BELUM PERNAH KLAIM ATAU SUDAH > 30 HARI)
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + 12);
        const expiredFormatted = expDate.toISOString().split('T')[0];
        const tokenFreeName = "ZEE_FREE_" + Math.random().toString(36).substring(2, 7).toUpperCase();

        await axios.put(`${FIREBASE_URL}/tokens/${tokenFreeName}.json`, { 
            status: "free", 
            expired: expiredFormatted 
        });
        
        await axios.put(`${FIREBASE_URL}/free_claims/${cleanDeviceId}.json`, { 
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

// ENDPOINT AMBIL SEMUA KOMENTAR MEMBER
app.get('/api/get-chats', async (req, res) => {
    try {
        const checkRes = await axios.get(`${FIREBASE_URL}/chats.json`);
        if (checkRes.data) {
            const chatArray = Object.values(checkRes.data);
            const recentChats = chatArray.slice(-20);
            return res.json({ success: true, chats: recentChats });
        }
        return res.json({ success: true, chats: [] });
    } catch (err) {
        res.status(500).json({ success: false, message: "Gagal mengambil pesan." });
    }
});

// ENDPOINT KIRIM KOMENTAR MEMBER (TANGGAL & JAM WIB)
app.post('/api/send-chat', async (req, res) => {
    const { name, message, image } = req.body;
    
    if (!name || (!message && !image)) {
        return res.status(400).json({ success: false, message: "Lengkapi nama dan pesan/foto!" });
    }

    try {
        const now = new Date();
        
        const dateFormatted = now.toLocaleDateString('id-ID', {
            timeZone: 'Asia/Jakarta',
            day: '2-digit',
            month: 'short'
        });

        const timeFormatted = now.toLocaleTimeString('id-ID', { 
            timeZone: 'Asia/Jakarta',
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false
        });

        const fullTimeFormat = `${dateFormatted}, ${timeFormatted}`;
        const chatId = Date.now();

        const payload = {
            name: name.substring(0, 20),
            message: message ? message.substring(0, 150) : "",
            time: fullTimeFormat
        };

        if (image) {
            payload.image = image;
        }

        await axios.put(`${FIREBASE_URL}/chats/${chatId}.json`, payload);

        return res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: "Gagal menyimpan pesan." });
    }
});

// Kompatibel untuk Vercel Serverless & Localhost
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));
}

module.exports = app;
