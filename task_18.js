import fetch from 'node-fetch';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Funkcja 1: Pobieranie HTML-a strony
async function fetchHTML(url) {
    try {
        const response = await fetch(url);
        return await response.text();
    } catch (error) {
        console.error(`Error fetching ${url}:`, error);
        return null;
    }
}

async function parsePageContent(html) {
    const $ = cheerio.load(html);
    
    // Zbierz tekst z ważnych elementów
    const content = {
        text: $('body').text(),
        links: [],
        emails: [],
        paragraphs: []
    };

    // Znajdź wszystkie linki
    $('a').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        if (href) content.links.push({ href, text });
    });

    // Znajdź wszystkie adresy email
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const bodyText = $('body').text();
    const emails = bodyText.match(emailRegex);
    if (emails) content.emails = emails;

    // Zbierz tekst z paragrafów
    $('p').each((_, el) => {
        const text = $(el).text().trim();
        if (text) content.paragraphs.push(text);
    });

    return content;
}

// Funkcja 2: Wysyłanie odpowiedzi do centrali
async function sendAnswers(answers) {
    try {
        const response = await fetch('https://centrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                apikey: process.env.PERSONAL_API_KEY,
                task: 'softo',
                answer: answers
            })
        });
        return await response.json();
    } catch (error) {
        console.error('Error sending answers:', error);
        return null;
    }
}

async function runAgent(questions) {
    const systemPrompt = `Jesteś agentem szukającym odpowiedzi na stronie softo.ag3nts.org.
Szukasz konkretnie:
1. Adresu email firmy
2. Adresu interfejsu webowego do sterowania robotami dla firmy BanAN
3. Dwóch certyfikatów ISO

Masz dostęp do funkcji:
- fetchHTML(url) - pobiera zawartość strony
- sendAnswers(answers) - wysyła odpowiedzi w formacie:
{
    "01": "konkretny adres email",
    "02": "konkretny adres interfejsu",
    "03": "konkretne nazwy dwóch certyfikatów ISO"
}

Szukaj dokładnie i zwracaj uwagę na szczegóły. Nie pomijaj żadnych informacji.
Przeanalizuj dokładnie każdą stronę, w tym stopkę, nagłówek i wszystkie sekcje.`;

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Zacznij od strony głównej i szukaj systematycznie. Zwróć szczególną uwagę na adresy email i szczegóły techniczne." }
    ];

    const visitedUrls = new Set();
    let iterations = 0;
    const maxIterations = 10;

    while (iterations < maxIterations) {
        iterations++;
        
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            temperature: 0,
            max_tokens: 1000
        });

        const agentResponse = completion.choices[0].message.content;
        console.log("\nAgent response:", agentResponse);

        if (agentResponse.includes("fetchHTML")) {
            const urlMatch = agentResponse.match(/fetchHTML\(['"]([^'"]+)['"]\)/);
            if (urlMatch) {
                const url = urlMatch[1];
                if (visitedUrls.has(url)) {
                    messages.push({ role: "user", content: "Ta strona była już sprawdzona. Spróbuj innej." });
                    continue;
                }
                
                visitedUrls.add(url);
                console.log(`\nFetching HTML from: ${url}`);
                const html = await fetchHTML(url);
                const content = await parsePageContent(html);
                
                messages.push({ role: "assistant", content: agentResponse });
                messages.push({ 
                    role: "user", 
                    content: `Zawartość strony:
                    Znalezione emaile: ${JSON.stringify(content.emails)}
                    Tekst: ${content.text.substring(0, 2000)}
                    Linki: ${JSON.stringify(content.links.slice(0, 10))}`
                });
                continue;
            }
        }

        if (agentResponse.includes("sendAnswers")) {
            const answersMatch = agentResponse.match(/sendAnswers\(({[\s\S]+?})\)/);
            if (answersMatch) {
                try {
                    const answers = JSON.parse(answersMatch[1]);
                    console.log("\nSending answers:", answers);
                    const result = await sendAnswers(answers);
                    console.log("Result:", result);
                    break;
                } catch (error) {
                    console.error("Error parsing answers:", error);
                    messages.push({ role: "user", content: "Błąd w formacie JSON. Spróbuj ponownie." });
                }
            }
        }
    }
}

async function main() {
    try {
        const apiKey = process.env.PERSONAL_API_KEY;
        const questionsResponse = await fetch(`https://centrala.ag3nts.org/data/${apiKey}/softo.json`);
        const questions = await questionsResponse.json();

        console.log('Questions:', questions);
        await runAgent(questions);

    } catch (error) {
        console.error('Error:', error);
    }
}

main();
