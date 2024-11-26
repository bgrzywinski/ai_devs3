import fetch from 'node-fetch';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();


const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function askAI(question) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "Jesteś pomocnym asystentem. Odpowiadaj konkretnie i krótko bez zbędnych znaków'."
                },
                {
                    role: "user",
                    content: question
                }
            ],
            temperature: 0.1 // Niska temperatura dla bardziej precyzyjnych odpowiedzi
        });

        return completion.choices[0].message.content.trim();
    } catch (error) {
        console.error("Błąd podczas pytania AI:", error);
        return null;
    }
}

async function main() {
    try {
        // 1. Pobierz pytanie ze strony
        const response = await fetch("https://xyz.ag3nts.org/");
        const pageContent = await response.text();
        
        // Wyciągnij pytanie z HTML
        const questionMatch = pageContent.match(/id="human-question">Question:<br \/>(.*?)<\/p>/);
        
        if (!questionMatch) {
            console.error("Nie udało się znaleźć pytania na stronie");
            return;
        }

        const questionText = questionMatch[1];
        console.log("Pytanie:", questionText);

        // 2. Zapytaj AI o odpowiedź
        const answer = await askAI(questionText);
        
        if (!answer) {
            console.error("Nie otrzymano odpowiedzi od AI");
            return;
        }

        console.log("Odpowiedź AI:", answer);

        // 3. Wyślij odpowiedź
        const post_response = await fetch("https://xyz.ag3nts.org/", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded",
            },
            body: `username=tester&password=574e112a&answer=${encodeURIComponent(answer)}`
        });

        const result = await post_response.text();
        console.log("Odpowiedź serwera:", result);

    } catch (error) {
        console.error("Wystąpił błąd:", error);
    }
}

main();