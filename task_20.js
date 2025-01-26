import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import fetch from 'node-fetch';

// Załaduj zmienne środowiskowe z pliku .env
dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Ustawienie __dirname dla ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Stałe konfiguracyjne
const BASE_URL = 'https://centrala.ag3nts.org';
const PDF_URL = `${BASE_URL}/dane/notatnik-rafala.pdf`;
const QUESTIONS_URL = `${BASE_URL}/data/${process.env.PERSONAL_API_KEY}/notes.json`;
const VISION_URL = `${BASE_URL}/data/${process.env.PERSONAL_API_KEY}/vision`;

// Utworzenie folderu na dane, jeśli nie istnieje
const DATA_DIR = 'data';
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

async function preprocessImage(inputPath) {
    const outputPath = 'data/preprocessed.png';
    await sharp(inputPath)
        .grayscale() // konwersja do skali szarości
        .normalize() // normalizacja kontrastu
        .sharpen() // wyostrzenie
        .threshold(128) // binaryzacja
        .toFile(outputPath);
    return outputPath;
}

// Funkcja do przetwarzania PDF
async function processPDF(pdfPath) {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();

        pdfParser.on("pdfParser_dataReady", pdfData => {
            try {
                const text = decodeURIComponent(pdfData.Pages.map(page => 
                    page.Texts.map(text => text.R.map(r => r.T).join(' ')).join(' ')
                ).join('\n'));

                const textPath = path.join(DATA_DIR, 'extracted_text.txt');
                fs.writeFileSync(textPath, text, 'utf8');
                console.log('Tekst został zapisany do pliku:', textPath);

                resolve(text);
            } catch (error) {
                reject(error);
            }
        });

        pdfParser.on("pdfParser_dataError", errData => reject(errData));

        pdfParser.loadPDF(pdfPath);
    });
}

// Funkcja do przetwarzania ostatniej strony jako obrazu
async function processLastPageImage() {
    try {
        console.log('Wysyłam zrzut ekranu ostatniej strony do modelu GPT-4o...');
        
        const imagePath = 'data/preprocessed.png';
        console.log('Ścieżka do pliku:', imagePath);
        
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = imageBuffer.toString('base64');
        
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "Na zdjęciu znajduje się tekst w języku polskim. Przepisz dokładnie cały widoczny tekst, zachowując jego oryginalną formę. Nie dodawaj żadnych interpretacji ani komentarzy."
                        },
                        {
                            type: "image_url",
                            image_url: { url: `data:image/png;base64,${base64Image}` }
                        }
                    ]
                }
            ]
        });

        // Wczytaj istniejący tekst
        const existingText = fs.readFileSync(path.join(DATA_DIR, 'extracted_text.txt'), 'utf8');
        
        // Połącz teksty
        const fullText = existingText + '\n\nZdjęcia odnalezionych fragmentów strony\n' + response.choices[0].message.content;
        
        // Zapisz połączony tekst
        const fullTextPath = path.join(DATA_DIR, 'full_text.txt');
        fs.writeFileSync(fullTextPath, fullText, 'utf8');
        console.log('Pełny tekst został zapisany do:', fullTextPath);
        
        return fullText;
    } catch (error) {
        console.error('Błąd podczas przetwarzania obrazu:', error);
        throw error;
    }
}

async function downloadFiles() {
    try {
        console.log('Rozpoczynam pobieranie plików...');

        // Pobieranie PDF
        console.log('Pobieranie pliku PDF...');
        const pdfResponse = await axios({
            url: PDF_URL,
            responseType: 'arraybuffer',
            timeout: 30000,
        });

        // Zapisanie PDF lokalnie
        const pdfPath = path.join(DATA_DIR, 'notatnik.pdf');
        fs.writeFileSync(pdfPath, pdfResponse.data);
        console.log('PDF został pobrany i zapisany.');

        // Pobieranie pytań
        console.log('Pobieranie pytań...');
        const questionsResponse = await axios({
            url: QUESTIONS_URL,
            timeout: 10000,
            headers: {
                'Accept': 'application/json'
            }
        });

        // Zapisanie pytań lokalnie
        const questionsPath = path.join(DATA_DIR, 'questions.json');
        fs.writeFileSync(questionsPath, JSON.stringify(questionsResponse.data, null, 2));
        console.log('Pytania zostały pobrane i zapisane.');

        return {
            pdfPath,
            questionsPath
        };
    } catch (error) {
        console.error('Wystąpił błąd podczas pobierania plików:', error);
        throw error;
    }
}

async function analyzeText() {
    try {
        // Wczytaj tekst i pytania
        const fullText = fs.readFileSync(path.join(DATA_DIR, 'full_text.txt'), 'utf8');
        const questions = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'questions.json'), 'utf8'));

        // Przeanalizuj tekst za pomocą GPT-4
        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: "Odpowiedz krótko i zwięźle na pytania na podstawie podanego tekstu. Na każde pytanie musisz odpowiedzieć jednym słowem lub krótką frazą."
                },
                {
                    role: "user",
                    content: `Na podstawie tekstu odpowiedz na pytania:

1. ${questions["01"]}
2. ${questions["02"]}
3. ${questions["03"]}
4. ${questions["04"]}
5. ${questions["05"]}

Tekst:
${fullText}

WAŻNE: Odpowiedz tylko krótkimi frazami, każda odpowiedź w nowej linii, bez numeracji.`
                }
            ]
        });

        // Przetwórz odpowiedzi na tablicę
        let answers = response.choices[0].message.content
            .split('\n')
            .filter(line => line.trim())
            .map(line => line.replace(/^\d+[\.\)]\s*/, '').trim());

        console.log('Surowe odpowiedzi:', answers);

        // Upewnij się, że mamy dokładnie 5 odpowiedzi
        if (answers.length !== 5) {
            console.log('Korygowanie liczby odpowiedzi...');
            answers = answers.slice(0, 5);
            while (answers.length < 5) {
                answers.push("brak odpowiedzi");
            }
        }

        // Upewnij się, że wszystkie odpowiedzi są niepustymi stringami
        answers = answers.map((answer, index) => {
            const processedAnswer = String(answer || "brak odpowiedzi").trim();
            console.log(`Odpowiedź ${index + 1}:`, processedAnswer);
            return processedAnswer;
        });

        console.log('Finalne odpowiedzi:', answers);
        console.log('Typ danych answers:', typeof answers);
        console.log('Długość tablicy:', answers.length);
        console.log('JSON do wysłania:', JSON.stringify(answers));

        // Wyślij odpowiedzi do API
        const aiDevsResponse = await fetch(`https://centrala.ag3nts.org/report`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                apikey: process.env.PERSONAL_API_KEY,
                task: 'notes',
                answer: answers
            })
        });

        const result = await aiDevsResponse.json();
        console.log('Odpowiedź z API:', result);

        return result;
    } catch (error) {
        console.error('Błąd podczas analizy tekstu:', error);
        throw error;
    }
}

// Główna funkcja
async function main() {
    try {
        const result = await analyzeText();
        console.log('Zadanie zakończone pomyślnie');
    } catch (error) {
        console.error('Błąd w głównej funkcji:', error.message);
        process.exit(1);
    }
}

// Uruchomienie programu
main();
