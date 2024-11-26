import fs from 'fs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

async function sendReport() {
  try {
    const reportData = fs.readFileSync('corrected_data.json', 'utf-8');
    const apiKey = process.env.PERSONAL_API_KEY;

    const response = await fetch("https://centrala.ag3nts.org/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
      task: "JSON",
      apikey: apiKey,
      answer: reportData,
    }),
    });

    const responseText = await response.text();
    console.log('Response status:', response.status);
    
    if (response.ok) {
      console.log('Raport został wysłany.');
    } else {
      console.error('Błąd podczas wysyłania raportu:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText
      });
    }
  } catch (error) {
    console.error('Błąd podczas wysyłania raportu:', error);
  }
}


sendReport();