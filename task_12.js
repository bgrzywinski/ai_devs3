import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import AdmZip from 'adm-zip';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { QdrantClient } from '@qdrant/js-client-rest';

// Load environment variables
dotenv.config();

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize Qdrant with the specific configuration
const qdrant = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
});

const COLLECTION_NAME = 'weapons_reports';
const EMBEDDING_MODEL = 'text-embedding-3-large';

// Get current file path in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test Qdrant connection
async function testQdrantConnection() {
    try {
        const result = await qdrant.getCollections();
        console.log('Successfully connected to Qdrant. Collections:', result.collections);
        return true;
    } catch (err) {
        console.error('Could not connect to Qdrant:', err);
        throw err;
    }
}

async function setupQdrantCollection() {
    try {
        // Check if collection exists
        const collections = await qdrant.getCollections();
        const collectionExists = collections.collections.some(c => c.name === COLLECTION_NAME);

        if (!collectionExists) {
            console.log('Creating new collection...');
            await qdrant.createCollection(COLLECTION_NAME, {
                vectors: {
                    size: 3072,  // size for text-embedding-3-large
                    distance: 'Cosine'
                }
            });
        }
    } catch (error) {
        console.error('Error setting up Qdrant collection:', error);
        throw error;
    }
}

async function extractWeaponsArchive() {
    try {
        console.log('Extracting weapons_tests archive...');
        const weaponsZip = new AdmZip('weapons_tests.zip');
        weaponsZip.extractAllTo('weapons_tests', true, null, '1670');
        console.log('Weapons tests archive extracted');

        return true;
    } catch (error) {
        console.error('Error extracting weapons archive:', error);
        throw error;
    }
}

function extractDate(content, filename) {
    // Pobierz datę z nazwy pliku (format: YYYY_MM_DD.txt)
    const fileNameMatch = filename.match(/(\d{4})_(\d{2})_(\d{2})/);
    if (fileNameMatch) {
        const [_, year, month, day] = fileNameMatch;
        return `${year}-${month}-${day}`; // Format YYYY-MM-DD
    }
    return null;
}

async function indexReports() {
    try {
        console.log('\n=== Starting indexing process ===');
        
        const doNotSharePath = path.join(__dirname, 'weapons_tests', 'do-not-share');
        console.log('Looking for files in:', doNotSharePath);
        
        const files = await fs.readdir(doNotSharePath);
        console.log('All files found:', files);
        
        let points = [];
        let id = 0;

        for (const file of files) {
            if (file.endsWith('.txt')) {
                const filePath = path.join(doNotSharePath, file);
                console.log(`\nProcessing file ${id + 1}/${files.length}: ${filePath}`);
                
                const content = await fs.readFile(filePath, 'utf-8');
                console.log(`File content length: ${content.length} characters`);
                
                // Przekaż nazwę pliku do funkcji extractDate
                const date = extractDate(content, file);
                console.log(`Extracted date from filename ${file}:`, date);
                
                console.log('Creating embedding...');
                const embedding = await openai.embeddings.create({
                    model: EMBEDDING_MODEL,
                    input: content,
                });
                console.log('Embedding created successfully');

                points.push({
                    id: id++,
                    vector: embedding.data[0].embedding,
                    payload: {
                        content,
                        date,
                        filename: file
                    }
                });
                console.log(`Added point for ${file} with date ${date}`);
            }
        }

        console.log('\n=== Uploading points to Qdrant ===');
        console.log(`Preparing to upload ${points.length} points`);

        if (points.length > 0) {
            await qdrant.upsert(COLLECTION_NAME, {
                points: points
            });
            console.log(`Successfully indexed ${points.length} reports to Qdrant`);
        }

        console.log('\n=== Indexing process completed ===');
        return points.length;

    } catch (error) {
        console.error('Error in indexing reports:', error);
        throw error;
    }
}

async function searchReports(question) {
    try {
        console.log('\nSearching for:', question);
        
        const questionEmbedding = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: question,
        });

        const searchResult = await qdrant.search(COLLECTION_NAME, {
            vector: questionEmbedding.data[0].embedding,
            limit: 1,
            with_payload: true
        });

        console.log('\nSearch results:', JSON.stringify(searchResult, null, 2));

        if (searchResult.length > 0) {
            console.log('Found date:', searchResult[0].payload.date);
            console.log('Content preview:', searchResult[0].payload.content.substring(0, 200));
            return searchResult[0].payload.date;
        }
        return null;
    } catch (error) {
        console.error('Error searching reports:', error);
        throw error;
    }
}

async function sendReport(date) {
    try {
        const response = await fetch('https://centrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.PERSONAL_API_KEY}`
            },
            body: JSON.stringify({
                task: 'wektory',
                apikey: process.env.PERSONAL_API_KEY,
                answer: date
            })
        });

        const result = await response.json();
        console.log('Report result:', result);
        return result;
    } catch (error) {
        console.error('Error sending report:', error);
        throw error;
    }
}

async function main() {
    try {
        // 1. Test połączenia z Qdrantem
        console.log('\nTesting Qdrant connection...');
        await testQdrantConnection();

        // 2. Utwórz kolekcję w Qdrancie
        console.log('\nSetting up Qdrant collection...');
        await setupQdrantCollection();

        // 3. Zaindeksuj dokumenty
        console.log('\nStarting document indexing...');
        const indexedCount = await indexReports();
        
        // 4. Poczekaj na zakończenie indeksowania
        console.log(`\nWaiting for ${indexedCount} documents to be fully indexed...`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 sekund przerwy

        // 5. Sprawdź czy dokumenty są w bazie
        const collectionInfo = await qdrant.getCollection(COLLECTION_NAME);
        console.log('\nCollection status after indexing:', collectionInfo);

        if (collectionInfo.points_count > 0) {
            console.log('\nDocuments successfully indexed, proceeding with search...');
            // Poczekaj chwilę po indeksowaniu
            console.log('\nWaiting for indexing to settle...');
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Wykonaj wyszukiwanie
            console.log('\nSearching for weapon prototype theft...');
            const question = "On which date does the report mention the theft of the weapon prototype?";
            const date = await searchReports(question);

            if (!date) {
                throw new Error('No date found in the search results');
            }

            // Wyślij raport
            console.log('\nSending report with date:', date);
            const result = await sendReport(date);
            console.log('Final result:', result);
        } else {
            console.log('\nNo documents found in collection, waiting longer...');
            // Możemy dodać dodatkowe oczekiwanie jeśli potrzeba
            await new Promise(resolve => setTimeout(resolve, 10000)); // dodatkowe 10 sekund
        }

        console.log('\nIndexing process completed');

    } catch (error) {
        console.error('Error in main:', error);
    }
}

console.log('API Key configuration:', {
    keyPresent: !!process.env.QDRANT_API_KEY,
    keyLength: process.env.QDRANT_API_KEY?.length
});

main();
