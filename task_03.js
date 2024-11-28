import fs from 'fs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import prompt_task03 from './prompt_task03.js';
import OpenAI from 'openai';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const personalApiKey = process.env.PERSONAL_API_KEY;
const url = `https://centrala.ag3nts.org/data/${personalApiKey}/json.txt`;

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

async function getLlmResponse(fragment) {
  try {
    const prompt = `${prompt_task03}
    Input:
    ${JSON.stringify(fragment, null, 2)}
    Output:
    `;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: prompt },
        { role: 'system', content: 'You are a helpful assistant who speaks only JSON.' }
      ],
      temperature: 0.1,
    });

    const rawContent = completion.choices[0].message.content.trim();
    const jsonContent = rawContent.replace(/```json|```/g, ''); // Remove markdown code fences

    return JSON.parse(jsonContent);
  } catch (error) {
    console.error('Błąd podczas interakcji z LLM:', error);
    return []; // Return an empty array on error
  }
}

async function processCalibrationFile() {
  try {
    const data = fs.readFileSync('data.txt', 'utf-8');
    const jsonData = JSON.parse(data);
    const questions = jsonData['test-data'];

    const fragmentSize = 500;
    const fragments = [];
    for (let i = 0; i < questions.length; i += fragmentSize) {
      fragments.push(questions.slice(i, i + fragmentSize));
    }

    const correctedFragments = await Promise.all(
      fragments.map(async (fragment) => {
        return await getLlmResponse(fragment);
      })
    );

    // Flatten and filter out nulls
    const correctedQuestions = correctedFragments.flat().filter(item => item !== null);

    const correctedData = {
      "task": "JSON",
      "apikey": personalApiKey,
      "answer": {
        "apikey": personalApiKey,
        "description": "This is simple calibration data used for testing purposes. Do not use it in production environment!",
        "copyright": "Copyright (C) 2238 by BanAN Technologies Inc.",
        "test-data": correctedQuestions
      }
    };

    fs.writeFileSync('corrected_data.json', JSON.stringify(correctedData, null, 2));
    console.log('Poprawiony plik został zapisany jako corrected_data.json');

    // await sendReport(correctedData);
  } catch (error) {
    console.error('Błąd podczas przetwarzania danych:', error);
  }
}
processCalibrationFile();