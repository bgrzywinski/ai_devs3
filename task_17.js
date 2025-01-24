import fetch from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import https from 'https';
import AdmZip from 'adm-zip';

dotenv.config();

// Funkcja do obliczania podobieństwa cosinusowego
function cosineSimilarity(vec1, vec2) {
    const dotProduct = vec1.reduce((acc, val, i) => acc + val * vec2[i], 0);
    const mag1 = Math.sqrt(vec1.reduce((acc, val) => acc + val * val, 0));
    const mag2 = Math.sqrt(vec2.reduce((acc, val) => acc + val * val, 0));
    return dotProduct / (mag1 * mag2);
}

async function downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }

            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                const buffer = Buffer.concat(chunks);
                fs.writeFile(outputPath, buffer)
                    .then(() => resolve(buffer))
                    .catch(reject);
            });
            response.on('error', reject);
        });
    });
}

async function main() {
    try {
        // 1. Pobierz i rozpakuj dane
        console.log('Downloading data...');
        const zipBuffer = await downloadFile('https://centrala.ag3nts.org/dane/lab_data.zip', './lab_data.zip');
        const zip = new AdmZip(zipBuffer);
        
        // 2. Wczytaj dane referencyjne
        const entries = zip.getEntries();
        console.log('Found entries:', entries.map(e => e.entryName));

        let validSamples = [];
        let invalidSamples = [];
        let samplesToCheck = [];
        
        for (const entry of entries) {
            const content = entry.getData().toString('utf8');
            const lines = content.split('\n').filter(line => line.trim());
            
            if (entry.entryName === 'correct.txt') {
                validSamples = lines;
                console.log('Valid samples:', validSamples.length);
            } else if (entry.entryName === 'incorrect.txt') {
                invalidSamples = lines;
                console.log('Invalid samples:', invalidSamples.length);
            } else if (entry.entryName === 'verify.txt') {
                samplesToCheck = lines;
                console.log('Samples to check:', samplesToCheck.length);
            }
        }

        // 3. Przygotuj embeddingi referencyjne
        console.log('\nExample data:');
        console.log('Valid sample:', validSamples[0]);
        console.log('Invalid sample:', invalidSamples[0]);
        console.log('Sample to check:', samplesToCheck[0]);

        // Zmiana: parsowanie danych referencyjnych - używamy bezpośrednio wartości
        const validEmbeddings = validSamples.map(sample => {
            return sample.split(',').map(Number);
        });

        const invalidEmbeddings = invalidSamples.map(sample => {
            return sample.split(',').map(Number);
        });

        // 4. Sprawdź każdą próbkę
        const validIds = [];
        const SIMILARITY_THRESHOLD = 0.7; // Obniżyłem próg

        for (const sample of samplesToCheck) {
            const [id, data] = sample.split('=');
            if (!data) {
                console.log('Skipping invalid sample:', sample);
                continue;
            }

            const embedding = data.split(',').map(Number);
            console.log(`\nProcessing ID ${id}, embedding:`, embedding);

            // Sprawdź podobieństwo do poprawnych próbek
            const validSimilarities = validEmbeddings.map(valid => 
                cosineSimilarity(embedding, valid)
            );

            // Sprawdź podobieństwo do niepoprawnych próbek
            const invalidSimilarities = invalidEmbeddings.map(invalid => 
                cosineSimilarity(embedding, invalid)
            );

            const maxValidSimilarity = Math.max(...validSimilarities);
            const maxInvalidSimilarity = Math.max(...invalidSimilarities);

            console.log(`ID ${id}: maxValidSim=${maxValidSimilarity.toFixed(3)}, maxInvalidSim=${maxInvalidSimilarity.toFixed(3)}`);

            // Jeśli próbka jest bardziej podobna do poprawnych niż niepoprawnych
            if (maxValidSimilarity > maxInvalidSimilarity && maxValidSimilarity > SIMILARITY_THRESHOLD) {
                validIds.push(id);
                console.log(`Added ID ${id} to valid list`);
            }
        }

        console.log('\nFound valid IDs:', validIds);
        console.log('Number of valid IDs:', validIds.length);
        
        const response = await fetch('https://centrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                apikey: process.env.PERSONAL_API_KEY,
                task: 'research',
                answer: validIds
            })
        })
        const token = await response.json();
        
        const answerResponse = await fetch('https://centrala.ag3nts.org/report' + token.token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answer: validIds, apikey: process.env.PERSONAL_API_KEY, task: 'research'})
        });

        console.log('Response:', await answerResponse.json());

    } catch (error) {
        console.error('Error:', error);
        console.error('Stack:', error.stack);
    }
}

main();
