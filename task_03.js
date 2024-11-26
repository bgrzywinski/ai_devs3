import fs from 'fs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import prompt_task03 from './prompt_task03.js';
dotenv.config();

const apiKey = process.env.PERSONAL_API_KEY; // Pobranie klucza API z pliku .env
const openaiApiKey = process.env.OPENAI_API_KEY; // Pobranie klucza API OpenAI z pliku .env
const url = `https://centrala.ag3nts.org/data/${apiKey}/json.txt`; // URL do pliku z danymi

async function downloadCalibrationFile() {
  try {
    const response = await fetch(url);
    const data = await response.text();
    fs.writeFileSync('data.txt', data);
    console.log('Plik data.txt został pobrany.');
  } catch (error) {
    console.error('Błąd podczas pobierania pliku:', error);
  }
}

// downloadCalibrationFile();


async function getLlmResponse(fragment) {
  try {
    const prompt = `${prompt_task03}
    Input:
    ${JSON.stringify(fragment, null, 2)}
    Output:
    `;

const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${openaiApiKey}`,
  },
  body: JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'user', 
        content: prompt 
      },
      { role: 'system',
        content: 'You are a helpful assistant who speaks only JSON.'
      }
    ],
    temperature: 0.1,
  }),
});

const data = await response.json();
return JSON.parse(data.choices[0].message.content.trim());  
  } catch (error) {
    console.error('Błąd podczas interakcji z LLM:', error);
    return null;
  }
}


// Funkcja do przetworzenia pliku
async function processCalibrationFile() {
  try {
    const data = fs.readFileSync('data.txt', 'utf-8');
    const jsonData = JSON.parse(data);
    const questions = jsonData['test-data'];

  
// Dzielenie pytań na fragmenty
  const fragmentSize = 500; // Dzielimy dane na fragmenty po 500 pytań
  const fragments = [];
  for (let i = 0; i < questions.length; i += fragmentSize) {
  fragments.push(questions.slice(i, i + fragmentSize));
}

// Przetwarzanie fragmentów
const correctedFragments = await Promise.all(
  fragments.map(async (fragment) => {
    try {
      return await getLlmResponse(fragment);
    } catch (error) {
      console.error('Błąd przetwarzania fragmentu:', error);
      throw error;
    }
  })
);

// Łączenie wyników
const correctedQuestions = correctedFragments.flat();
// Zapisanie poprawionego pliku
const correctedData = { ...jsonData, correctedQuestions };
fs.writeFileSync('corrected_data.json', JSON.stringify(correctedData, null, 2));
console.log('Poprawiony plik został zapisany jako corrected_data.json');
} catch (error) {
console.error('Błąd podczas przetwarzania danych:', error);
}
}

// Przetwarzanie pliku
processCalibrationFile();