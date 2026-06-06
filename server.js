const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

// إعداد OpenAI API للإصدار الرابع (v4)
const openai = new OpenAI({
    apiKey: 'YOUR_OPENAI_API_KEY', // ضع مفتاح الـ API الخاص بك هنا
});

// هندسة الأوامر (Prompt Engineering) لتقييد الذكاء الاصطناعي بعلم التشريح
const systemPrompt = "You are an expert Anatomy Assistant. Only answer questions related to human anatomy, physiology, and medical sciences. If the user asks about anything else, politely decline and state your purpose.";

app.post('/api/chat', async (req, res) => {
    try {
        const userMessage = req.body.message;
        
        // طريقة الاستدعاء الجديدة في الإصدار الرابع
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
        });

        // طريقة قراءة الاستجابة الجديدة
        res.json({ reply: completion.choices[0].message.content });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "An error occurred while fetching the response." });
    }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));