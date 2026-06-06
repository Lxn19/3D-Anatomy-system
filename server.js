require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/chat', async (req, res) => {
  try {
    const question       = req.body.question;
    const currentContext = req.body.currentContext;

    let mockReply =
      `Welcome to the Anatomy Intelligent Assistant for Middle East University (MEU).\n\n` +
      `Based on your request regarding the active organ: **${currentContext}**.\n\n`;

    if (currentContext.toLowerCase().includes('stomach')) {
      mockReply +=
        `The primary anatomical and physiological functions of the stomach include:\n` +
        `1. **Mechanical Digestion:** The muscular walls of the stomach churn and grind food into a semi-liquid mixture called chyme.\n` +
        `2. **Chemical Digestion:** Secretion of gastric juices, including Hydrochloric Acid (HCl) and pepsin, to break down complex proteins.\n` +
        `3. **Intrinsic Factor Secretion:** Essential for the absorption of Vitamin B12 in the small intestine.\n` +
        `4. **Controlled Release:** Regulating the passage of chyme into the duodenum through the pyloric sphincter.`;
    } else if (currentContext.toLowerCase().includes('heart')) {
      mockReply +=
        `The primary anatomical functions of the heart include:\n` +
        `1. **Pumping Deoxygenated Blood:** Receiving deoxygenated blood from the body and pumping it to the lungs via pulmonary circulation.\n` +
        `2. **Distributing Oxygenated Blood:** Pumping oxygen-rich blood received from the lungs out to the rest of the body through the aorta.\n` +
        `3. **Maintaining Blood Pressure:** Generating sufficient systemic pressure to ensure continuous perfusion of all vital organs.`;
    } else {
      mockReply +=
        `This organ is a vital component of the anatomical system, performing specialized physiological roles to sustain homeostasis and support body functions.`;
    }

    res.json({ reply: mockReply });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred on the server' });
  }
});

app.listen(5000, () => {
  console.log('Server running on port 5000');
});