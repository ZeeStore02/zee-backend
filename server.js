const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors'); // Wajib
const app = express();

app.use(cors()); // Wajib biar bisa dipanggil dari GitHub Pages
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const FIREBASE_URL = "https://token-pengguna-default-rtdb.asia-southeast1.firebasedatabase.app";
const MERCHANT_CODE = "DS37162"; 
const API_KEY = "83bf3084dc5e8a53723ec9fcfbcfab4b"; 

app.get('/', (req, res) => {
    res.send("Server ZEE STORE Backend Aktif!");
});

app.post('/api/create-qris', async (req, res) => {
    const { amount } = req.body;
    if (!amount || amount < 10000) return res.status(400).json({ success: false, message: "Nominal minimal Rp 10.000" });

    const merchantOrderId = "ZEE-" + Date.now();
    const paymentAmount = parseInt(amount);

    const signature = crypto.createHash('md5')
                            .update(MERCHANT_CODE + merchantOrderId + paymentAmount + API_KEY)
                            .digest('hex');

    const payload = {
        merchantCode: MERCHANT_CODE,
        paymentAmount: paymentAmount,
        paymentMethod: 'SP',
        merchantOrderId: merchantOrderId,
        productDetails: `Token Premium (${paymentAmount / 10000} Bulan)`,
        customerVaName: 'Pembeli Zee Store',
        email: 'customer@zeestore.com',
        phoneNumber: '081330549762',
        callbackUrl: 'https://zee-backend-black.vercel.app/api/callback',
        returnUrl: 'https://zeestore02.github.io/',
        signature: signature,
        expiryPeriod: 60
    };

    try {
        const response = await axios.post('https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry', payload);
        res.json({
            success: true,
            paymentUrl: response.data.paymentUrl || response.data.qrCodeUrl,
            merchantOrderId: merchantOrderId
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/callback', async (req, res) => {
    const { merchantCode, amount, merchantOrderId, resultMap, signature } = req.body;
    const calcSignature = crypto.createHash('md5').update(merchantCode + amount + merchantOrderId + API_KEY).digest('hex');

    if (signature !== calcSignature) return res.status(400).send('Invalid Signature');

    if (resultMap === '00') {
        const nominal = parseInt(amount);
        const totalHari = Math.floor(nominal / 10000) * 30;
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + totalHari);

        const tokenName = "ZEE_P" + Math.random().toString(36).substring(2, 7).toUpperCase();

        try {
            await axios.put(`${FIREBASE_URL}/tokens/${tokenName}.json`, {
                status: "premium",
                expired: expDate.toISOString().split('T')[0]
            });
            return res.status(200).send('OK');
        } catch (error) {
            return res.status(500).send('Database Error');
        }
    }
    res.status(200).send('OK');
});

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
