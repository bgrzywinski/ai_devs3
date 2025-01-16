import fs from 'fs';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import path from 'path';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function analyzeImage(imagePath) {
    try {
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
                            text: "Analizujesz fragment mapy polskiego miasta. To jeden z czterech fragmentów, gdzie jeden może być mylący. To miasto słynie z sieci spichlerzy i fortyfikacji (UWAGA: to NIE jest Toruń). Zwróć szczególną uwagę na ulicę Kalinowską, jeśli jest obecna. Dla tego fragmentu:\n\n1. Jeśli widzisz ulicę Kalinowską, przeanalizuj dokładnie jej położenie i połączenia\n2. Szukaj spichlerzy, fortyfikacji i historycznych struktur wojskowych - to miasto jest z nich szczególnie znane\n3. Wypisz wszystkie widoczne nazwy ulic i ich układ/połączenia\n4. Zanotuj znaczące punkty orientacyjne, budynki lub cechy geograficzne\n5. Szukaj wzorców urbanistycznych charakterystycznych dla miasta z rozwiniętą infrastrukturą militarną i magazynową\n\nBądź precyzyjny w opisywaniu elementów, które mogą wskazywać na konkretne polskie miasto znane z rozbudowanego systemu spichlerzy i fortyfikacji."
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Image}`,
                                detail: "high"
                            }
                        }
                    ],
                }
            ],
            max_tokens: 5000
        });

        return response.choices[0].message.content;
    } catch (error) {
        console.error(`Error analyzing image ${imagePath}:`, error);
        throw error;
    }
}

async function analyzeAllImages() {
    const analyses = [];
    const imageFiles = ['1.jpg', '2.jpg', '3.jpg', '4.jpg'];

    for (const imageFile of imageFiles) {
        const imagePath = path.join('map_images', imageFile);
        console.log(`\nAnalyzing ${imageFile}...`);
        const analysis = await analyzeImage(imagePath);
        analyses.push({ file: imageFile, analysis });
        console.log(`Analysis for ${imageFile}:`, analysis);
    }

    const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
            {
                role: "system",
                content: "Jesteś ekspertem od kartografii specjalizującym się w historycznych polskich miastach ze znaczącymi systemami spichlerzy i fortyfikacji. Pamiętaj, że choć Toruń ma podobne cechy, to NIE jest to miasto, którego szukamy. Skup się na innych polskich miastach, które były ważnymi centrami magazynowymi z rozbudowanymi fortyfikacjami."
            },
            {
                role: "user",
                content: `Przeanalizuj te fragmenty map, aby zidentyfikować polskie miasto, które było ważnym historycznym centrum spichlerzy i fortyfikacji (to NIE jest Toruń). Weź pod uwagę:\n1. Obecność ulicy Kalinowskiej i jej znaczenie w kontekście dzielnic spichrzowych\n2. Dowody na istnienie rozbudowanych systemów spichlerzy i fortyfikacji wojskowych\n3. Układ ulic charakterystyczny dla głównego centrum magazynowego i obronnego\n4. Historyczne znaczenie jako centrum spichrzowe\n5. Który fragment może być mylący\n\nAnaliza fragmentów:\n${analyses.map(a => `Fragment ${a.file}:\n${a.analysis}\n`).join('\n')}\n\nNa podstawie tej analizy, szczególnie obecności ulicy Kalinowskiej i wiedząc, że to miasto było ważnym centrum spichrzowym z rozbudowanymi fortyfikacjami, jakie to polskie miasto? Pamiętaj: to NIE jest Toruń. Przed podaniem odpowiedzi sprawdź, czy lokalizacje z fragmentów mapy rzeczywiście występują w tym mieście.`
            }
        ],
        temperature: 0
    });

    return completion.choices[0].message.content.trim();
}

async function main() {
    try {
        console.log('Starting image analysis process...');
        const result = await analyzeAllImages();
        console.log('\n=== FINAL RESULT ===');
        console.log(result);
        
    } catch (error) {
        console.error('Error in main process:', error);
    }
}

console.log('Initializing process...');
main().then(() => {
    console.log('\nProcess completed.');
}).catch(error => {
    console.error('Process failed with error:', error);
});