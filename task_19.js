import express from 'express';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
app.use(express.json());

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const systemPrompt = `Jesteś precyzyjnym nawigatorem drona na mapie 4x4. Twoim zadaniem jest śledzić ruchy drona i dokładnie opisać jego końcową lokalizację.

MAPA (współrzędne [wiersz,kolumna]):
[0,0] START (znacznik) | [0,1] trawa | [0,2] drzewo | [0,3] dom
[1,0] trawa | [1,1] wiatrak | [1,2] trawa | [1,3] trawa
[2,0] trawa | [2,1] trawa | [2,2] skały | [2,3] dwa drzewa
[3,0] góry | [3,1] góry | [3,2] samochód | [3,3] jaskinia

ZASADY RUCHU:
1. Dron startuje z [0,0] (lewy górny róg)
2. "na maksa w prawo" = przejście do kolumny 3 w tym samym wierszu
3. "na maksa w lewo" = przejście do kolumny 0 w tym samym wierszu
4. "na maksa w dół" = przejście do wiersza 3 w tej samej kolumnie
5. "na maksa w górę" = przejście do wiersza 0 w tej samej kolumnie

PRZYKŁADY:
- "na maksa w prawo" ze startu [0,0] -> [0,3] (dom)
- "na maksa w dół" ze startu [0,0] -> [3,0] (góry)
- "na maksa w prawo, na maksa w dół" -> [0,3] -> [3,3] (góra)

Śledź dokładnie ruchy i podaj końcową lokalizację.
Odpowiedz w formacie:
ANALIZA: szczegółowa analiza ruchów krok po kroku
POZYCJA: [wiersz,kolumna]
OPIS: dokładny opis lokalizacji (max 2 słowa)`;

app.post('/', async (req, res) => {
    try {
        const { instruction } = req.body;
        console.log('Received instruction:', instruction);

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Przeanalizuj ruchy drona: ${instruction}` }
            ],
            temperature: 0
        });

        const response = completion.choices[0].message.content;
        console.log('Full analysis:', response);

        // Wyciągnij tylko opis lokalizacji z pełnej odpowiedzi
        const descriptionMatch = response.match(/OPIS: (.*)/);
        const description = descriptionMatch ? descriptionMatch[1].trim() : "nie znaleziono";

        console.log('Final description:', description);
        res.json({ description });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Uruchom serwer na lokalnym porcie
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Funkcja do rejestracji webhooka
const registerWebhook = async (ngrokUrl) => {
    try {
        const response = await fetch('https://centrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                apikey: process.env.PERSONAL_API_KEY,
                task: 'webhook',
                answer: ngrokUrl
            })
        });

        const result = await response.json();
        console.log('Registration result:', result);

    } catch (error) {
        console.error('Error registering webhook:', error);
    }
};

// Wywołaj funkcję rejestracji na końcu
registerWebhook('https://18d4-83-0-97-249.ngrok-free.app');
