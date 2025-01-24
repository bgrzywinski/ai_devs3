import fetch from 'node-fetch';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs/promises';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function fetchData() {
    try {
        const response = await fetch(`https://centrala.ag3nts.org/data/${process.env.PERSONAL_API_KEY}/json.txt`);
        const data = await response.text();
        return JSON.parse(data);
    } catch (error) {
        console.error('Error fetching data:', error);
        return null;
    }
}

// Funkcja dzieląca dane testowe na mniejsze części
function splitTestData(testData) {
    const numberOfChunks = 4;
    const chunkSize = Math.ceil(testData.length / numberOfChunks);
    const chunks = [];
    
    for (let i = 0; i < testData.length; i += chunkSize) {
        chunks.push(testData.slice(i, i + chunkSize));
    }
    
    console.log(`Created ${chunks.length} chunks of approximately ${chunkSize} items each`);
    return chunks;
}

// Funkcja do przetwarzania chunka danych przez GPT
async function processChunk(chunk, chunkIndex) {
    console.log(`\nProcessing chunk ${chunkIndex + 1} (size: ${chunk.length} items)`);
    
    // Najpierw przetwarzamy pytania testowe osobno
    const processedChunk = [...chunk];
    const questionsToAnswer = processedChunk
        .filter(item => item.test && item.test.a === "???")
        .map(item => ({
            question: item.test.q,
            index: processedChunk.indexOf(item)
        }));

    if (questionsToAnswer.length > 0) {
        const prompt = `Answer these questions briefly and precisely:

${questionsToAnswer.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}

Respond in this JSON format:
{
    "answers": [
        "answer1",
        "answer2"
    ]
}`;

        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "You are a precise answering assistant. Provide short, factual answers."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0,
                response_format: { type: "json_object" }
            });

            const answers = JSON.parse(completion.choices[0].message.content).answers;
            
            // Aktualizujemy odpowiedzi w danych
            questionsToAnswer.forEach((q, i) => {
                if (answers[i]) {
                    processedChunk[q.index].test.a = answers[i];
                }
            });
        } catch (error) {
            console.error('Error processing test questions:', error);
        }
    }

    // Teraz sprawdzamy obliczenia
    processedChunk.forEach(item => {
        const calculatedAnswer = eval(item.question);
        if (calculatedAnswer !== item.answer) {
            console.log(`Correcting calculation for "${item.question}": ${item.answer} -> ${calculatedAnswer}`);
            item.answer = calculatedAnswer;
        }
    });

    // Sprawdzamy, czy wszystkie pytania zostały odpowiedziane
    const remainingQuestions = processedChunk.filter(item => item.test && item.test.a === "???");
    if (remainingQuestions.length > 0) {
        console.warn(`Warning: ${remainingQuestions.length} questions remain unanswered in chunk ${chunkIndex + 1}`);
        console.warn('Unanswered questions:', remainingQuestions.map(item => item.test.q));
    }

    return processedChunk;
}

async function processChunksParallel(chunks) {
    console.log(`Processing ${chunks.length} chunks in parallel...`);
    
    // Przetwarzaj chunki równolegle, ale nie więcej niż 2 naraz
    const results = [];
    for (let i = 0; i < chunks.length; i += 2) {
        const chunkPromises = [
            processChunk(chunks[i], i)
        ];
        
        if (i + 1 < chunks.length) {
            chunkPromises.push(processChunk(chunks[i + 1], i + 1));
        }
        
        console.log(`Processing chunks ${i + 1}${i + 1 < chunks.length ? ` and ${i + 2}` : ''} simultaneously...`);
        const processedChunks = await Promise.all(chunkPromises);
        results.push(...processedChunks);
    }
    
    return results;
}

async function saveToFile(data, filename) {
    try {
        await fs.writeFile(filename, JSON.stringify(data, null, 2));
        console.log(`Data saved to ${filename}`);
    } catch (error) {
        console.error('Error saving file:', error);
    }
}

async function main() {
    try {
        // 1. Pobierz dane
        const rawData = await fetchData();
        if (!rawData) return;

        console.log('Data loaded successfully');

        // 2. Zachowaj oryginalne metadane
        const answer = {
            apikey: process.env.PERSONAL_API_KEY,
            description: rawData.description,
            copyright: rawData.copyright,
            "test-data": []
        };

        // 3. Podziel dane testowe na chunki
        const chunks = splitTestData(rawData['test-data']);
        console.log(`Split into ${chunks.length} chunks`);

        // 4. Przetwórz chunki równolegle
        const processedChunks = await processChunksParallel(chunks);
        answer['test-data'] = processedChunks.flat();

        // 5. Zapisz wynik do pliku
        const finalAnswer = {
            apikey: process.env.PERSONAL_API_KEY,
            answer: answer,
            task: 'json'
        };

        await saveToFile(finalAnswer, 'processed_data.json');
        console.log('Data saved to processed_data.json');

        // 6. Sprawdź, czy wszystkie pytania zostały odpowiedziane
        const unansweredQuestions = answer['test-data'].filter(item => item.test && item.test.a === "???");
        if (unansweredQuestions.length > 0) {
            console.error(`ERROR: ${unansweredQuestions.length} questions remain unanswered!`);
            console.error('Unanswered questions:', unansweredQuestions.map(item => item.test.q));
        } else {
            console.log('All questions have been answered successfully!');
        }

        // 7. Wyślij odpowiedź
        const response = await fetch('https://centrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(finalAnswer)
        });

        const result = await response.json();
        console.log('Result:', result);

    } catch (error) {
        console.error('Error in main:', error);
    }
}

main();