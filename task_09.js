import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import https from 'https';
import { Extract } from 'unzipper';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function downloadAndExtractZip() {
    const url = 'https://centrala.ag3nts.org/dane/pliki_z_fabryki.zip';
    const zipPath = './pliki_z_fabryki.zip';

    console.log('Downloading ZIP file...');
    
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }

            const writeStream = createWriteStream(zipPath);
            response.pipe(writeStream);

            writeStream.on('finish', () => {
                console.log('Download completed. Extracting...');
                
                // Extract the ZIP file using createReadStream from regular fs
                createReadStream(zipPath)
                    .pipe(Extract({ path: './pliki_z_fabryki' }))
                    .on('close', () => {
                        console.log('Extraction completed');
                        // Clean up the ZIP file
                        fs.unlink(zipPath)
                            .then(() => resolve())
                            .catch(reject);
                    })
                    .on('error', reject);
            });

            writeStream.on('error', reject);
        }).on('error', reject);
    });
}

async function analyzeFile(filePath) {
    const fileType = path.extname(filePath).toLowerCase();
    
    try {
        switch (fileType) {
            case '.txt':
                const content = await fs.readFile(filePath, 'utf-8');
                return await analyzeTxtContent(content);
            
            case '.png':
                return await analyzeImage(filePath);
            
            case '.mp3':
                return await analyzeAudio(filePath);
            
            default:
                return null;
        }
    } catch (error) {
        console.error(`Error analyzing file ${filePath}:`, error);
        return null;
    }
}

async function analyzeTxtContent(content) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: `You are analyzing factory reports to identify content about:
1. PEOPLE: Reports describing human activities, especially hostile ones (captured or not)
2. MACHINES: Reports about technical equipment, systems, and infrastructure`
            },
            {
                role: "user",
                content: `Analyze this text carefully and determine its main focus:

CATEGORIZATION RULES:
1. PEOPLE category if the content describes:
   - Human hostile activities
   - Reports about captured individuals
   - Suspicious personnel behavior
   - Human threats or incidents
   - Personnel investigations

2. MACHINES category if the content focuses on:
   - Technical systems and equipment
   - Infrastructure maintenance
   - Hardware operations
   - System updates or repairs
   - Technical procedures

Text to analyze:
${content}

Respond ONLY with 'people' or 'machines'.`
            }
        ],
        temperature: 0
    });
    
    return response.choices[0].message.content.toLowerCase();
}

async function analyzeImage(filePath) {
    const imageBuffer = await fs.readFile(filePath);
    const base64Image = imageBuffer.toString('base64');
    
    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: `
Jesteś ekspertem analizującym raporty fabryczne.
Szukasz dwóch rodzajów treści:
1. LUDZIE: Raporty opisujące działania ludzi, szczególnie wrogie (schwytani lub nie)
2. MASZYNY: Raporty o sprzęcie technicznym i infrastrukturze`
            },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: `
Przeanalizuj ten obraz i określ, czy dotyczy:

1. LUDZIE - jeśli treść opisuje:
   - Wrogie działania ludzi
   - Raporty o schwytanych osobach
   - Podejrzane zachowania personelu
   - Zagrożenia ze strony ludzi
   - Dochodzenia dotyczące personelu

2. MASZYNY - jeśli treść dotyczy:
   - Systemów technicznych
   - Konserwacji infrastruktury
   - Operacji sprzętowych
   - Aktualizacji systemów
   - Procedur technicznych

Odpowiedz TYLKO 'ludzie' lub 'maszyny'.`
                    },
                    {
                        type: "image_url",
                        image_url: { url: `data:image/png;base64,${base64Image}` }
                    }
                ]
            }
        ],
        max_tokens: 10
    });

    return response.choices[0].message.content.toLowerCase();
}

async function analyzeAudio(filePath) {
    try {
        const audioFile = await fs.readFile(filePath);
        const blob = new Blob([audioFile]);
        const file = new File([blob], path.basename(filePath), { type: 'audio/mp3' });

        const transcription = await openai.audio.transcriptions.create({
            file: file,
            model: "whisper-1",
            language: "en"
        });

        console.log(`Transcription for ${path.basename(filePath)}:`, transcription.text);

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `You are analyzing factory audio reports to identify:
1. PEOPLE: Reports about human activities, especially hostile ones (captured or not)
2. MACHINES: Reports about technical systems and infrastructure`
                },
                {
                    role: "user",
                    content: `
Analyze this transcription and determine its main focus:

CATEGORIZATION RULES:
1. PEOPLE category if the content describes:
   - Human hostile activities
   - Reports about captured individuals
   - Suspicious personnel behavior
   - Human threats or incidents
   - Personnel investigations

2. MACHINES category if the content focuses on:
   - Technical systems and equipment
   - Infrastructure maintenance
   - Hardware operations
   - System updates or repairs
   - Technical procedures

Transcribed text:
${transcription.text}

Respond ONLY with 'people' or 'machines'.`
                }
            ],
            temperature: 0
        });

        const category = response.choices[0].message.content.toLowerCase();
        console.log(`Audio analysis for ${path.basename(filePath)} → Category: ${category}`);
        return category;
    } catch (error) {
        console.error(`Error analyzing audio file ${filePath}:`, error);
        return "machines";
    }
}

async function processFiles(directoryPath) {
    const result = {
        people: [],
        hardware: []
    };
    
    try {
        const files = await fs.readdir(directoryPath);
        
        // Get all files and pre-sort them
        const allFiles = (await Promise.all(
            files
                .filter(file => file !== "facts" && file !== "weapon")
                .map(async file => {
                    const filePath = path.join(directoryPath, file);
                    const stat = await fs.stat(filePath);
                    return stat.isFile() ? file : null;
                })
        ))
        .filter(file => file !== null)
        .sort((a, b) => a.localeCompare(b)); // Pre-sort all files

        // Process each file
        for (const file of allFiles) {
            const filePath = path.join(directoryPath, file);
            console.log(`\nProcessing file: ${file}`);
            const category = await analyzeFile(filePath);
            console.log(`Category for ${file}: ${category}`);
            
            if (category === "people") {
                result.people.push(file);
            } else if (category === "machines") {
                result.hardware.push(file);
            }
        }

        // Final review to ensure correct categorization
        const reviewedResult = await finalReview(result);
        
        console.log('\nFinal categorization after review and sorting:');
        console.log('People:', reviewedResult.people);
        console.log('Hardware:', reviewedResult.hardware);
        
        return reviewedResult;
    } catch (error) {
        console.error('Error processing files:', error);
        throw error;
    }
}

async function sendReport(data) {
    try {
        const response = await fetch('https://centrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.PERSONAL_API_KEY}`
            },
            body: JSON.stringify({
                task: 'kategorie',
                apikey: process.env.PERSONAL_API_KEY,
                answer: data
            })
        });

        const result = await response.json();
        console.log('Server response:', result);
        
        if (response.ok) {
            console.log('Report sent successfully.');
        } else {
            console.error('Error sending report:', result);
        }
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

async function main() {
    try {
        // First download and extract the ZIP file
        await downloadAndExtractZip();
        
        console.log('Starting file analysis...');
        const result = await processFiles('./pliki_z_fabryki');
        console.log('Analysis result:', result);
        
        // Save result to JSON file
        await fs.writeFile('report.json', JSON.stringify(result, null, 2));
        console.log('Report saved to report.json');
        
        // Send report to Central Office
        await sendReport(result);
        
    } catch (error) {
        console.error('Error in main process:', error);
    }
}

async function finalReview(result) {
    const reviewedResult = {
        people: [],
        hardware: []
    };

    // Keep original categorization for audio files
    const audioFiles = new Set(result.people.filter(file => file.endsWith('.mp3')));

    [...result.people, ...result.hardware].forEach(file => {
        // If it's an audio file that was originally categorized as people, keep it there
        if (audioFiles.has(file)) {
            reviewedResult.people.push(file);
        }
        // For other files, check technical keywords
        else if (file.includes('sektor') || file.includes('roboty') || file.includes('maszyny') || file.includes('technika')) {
            if (!reviewedResult.hardware.includes(file)) {
                reviewedResult.hardware.push(file);
            }
        } else {
            if (!reviewedResult.people.includes(file)) {
                reviewedResult.people.push(file);
            }
        }
    });

    // Ensure strict alphabetical sorting
    reviewedResult.people.sort((a, b) => a.localeCompare(b, 'pl', { numeric: true }));
    reviewedResult.hardware.sort((a, b) => a.localeCompare(b, 'pl', { numeric: true }));

    return reviewedResult;
}

console.log('Initializing process...');
main().then(() => {
    console.log('\nProcess completed.');
}).catch(error => {
    console.error('Process failed with error:', error);
});
