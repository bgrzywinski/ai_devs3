import fs from 'fs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const personalApiKey = process.env.PERSONAL_API_KEY;
const url = `https://centrala.ag3nts.org/data/${personalApiKey}/cenzura.txt`;

async function downloadDataFile() {
  try {
    const response = await fetch(url);
    const data = await response.text();
    fs.writeFileSync('raw_data.txt', data);
    console.log('Raw data file has been downloaded successfully.');
    return data;
  } catch (error) {
    console.error('Error downloading file:', error);
    throw error;
  }
}

async function anonymizeText(text) {
  try {
    const prompt = `Zastąp wszystkie wrażliwe dane słowem "CENZURA". Nie zmieniaj pozostałej struktury tekstu.

    Zasady:
    1. Zamień imię i nazwisko na "CENZURA"
    2. Zamień nazwę miasta na "CENZURA"
    3. Zamień nazwę ulicy wraz z numerem na "CENZURA"
    4. Zamień wiek (liczbę lat) na "CENZURA"

    Przykład:
    Wejście: "Dane osoby podejrzanej: Paweł Zieliński. Zamieszkały w Warszawie na ulicy Pięknej 5. Ma 28 lat."
    Wyjście: "Dane osoby podejrzanej: CENZURA. Zamieszkały w CENZURA na ulicy CENZURA. Ma CENZURA lat."

    Tekst do zanonimizowania:
    ${text}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { 
          role: 'system', 
          content: 'Jesteś asystentem do anonimizacji danych. Odpowiadaj tylko zanonimizowanym tekstem.' 
        },
        { 
          role: 'user', 
          content: prompt 
        }
      ],
      temperature: 0,
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error during LLM interaction:', error);
    return null;
  }
}

async function sendReport() {
  try {
    // Odczytanie zanonimizowanych danych z pliku
    const anonymizedText = fs.readFileSync('anonymized_data.txt', 'utf-8');
    
    // Przygotowanie ciała zapytania
    const body = JSON.stringify({
      task: 'CENZURA',
      apikey: personalApiKey,
      answer: anonymizedText
    });
    console.log('Dane przygotowane do wysłania.');

    // Wysłanie danych do endpointa verify z kluczem API w nagłówkach
    const verifyResponse = await fetch('https://centrala.ag3nts.org/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${personalApiKey}`
      },
      body: body
    });

    // Odczytanie i wypisanie odpowiedzi serwera
    const result = await verifyResponse.json();
    console.log(result); // Wyświetlenie wyniku w konsoli
    
    if (verifyResponse.ok) {
      console.log('Raport został wysłany pomyślnie.');
    } else {
      console.error('Błąd podczas wysyłania raportu:', {
        status: verifyResponse.status,
        statusText: verifyResponse.statusText,
        result: result
      });
    }
  } catch (error) {
    console.error('Wystąpił błąd:', error);
    throw error;
  }
}

async function processData() {
  try {
    // 1. Download the data
    console.log('Step 1: Downloading data...');
    const rawData = await downloadDataFile();
    console.log('Download completed.\n');
    
    // 2. Process and anonymize
    console.log('Step 2: Processing and anonymizing data...');
    const textChunks = [];
    const chunkSize = 1000;
    
    for (let i = 0; i < rawData.length; i += chunkSize) {
      let chunk = rawData.slice(i, i + chunkSize);
      let lastPeriod = chunk.lastIndexOf('.');
      
      if (lastPeriod !== -1 && i + chunkSize < rawData.length) {
        chunk = chunk.slice(0, lastPeriod + 1);
        i = i + lastPeriod + 1 - chunkSize;
      }
      
      textChunks.push(chunk);
    }

    console.log(`Processing ${textChunks.length} chunks of text...`);

    const anonymizedChunks = [];
    for (let i = 0; i < textChunks.length; i++) {
      console.log(`Processing chunk ${i + 1}/${textChunks.length}`);
      const anonymizedChunk = await anonymizeText(textChunks[i]);
      if (anonymizedChunk) {
        anonymizedChunks.push(anonymizedChunk);
      }
    }

    const anonymizedText = anonymizedChunks.join(' ');
    console.log('Processing completed.\n');

    // 3. Save locally
    console.log('Step 3: Saving processed data locally...');
    fs.writeFileSync('anonymized_data.txt', anonymizedText);
    console.log('Data saved to anonymized_data.txt\n');

    // 4. Show results
    console.log('Step 4: Showing processed data sample:');
    console.log('First 200 characters of anonymized text:');
    console.log(anonymizedText.slice(0, 200) + '...\n');

    // 5. Send to server
    console.log('Step 5: Sending to server...');
    await sendReport();

  } catch (error) {
    console.error('Error in process:', error);
  }
}

// Run the process
console.log('Starting data anonymization process...');
processData().then(() => {
  console.log('\nAll steps completed successfully.');
}).catch(error => {
  console.error('Process failed:', error);
});