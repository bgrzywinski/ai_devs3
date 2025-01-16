import fs from 'fs';
import fetch from 'node-fetch';
import AdmZip from 'adm-zip';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { File } from 'buffer';
import path from 'path';
import { createReadStream } from 'fs';

// Add initial checks
console.log('Starting script...');

// Check if .env is loaded
dotenv.config();
if (!process.env.OPENAI_API_KEY || !process.env.PERSONAL_API_KEY) {
    console.error('Error: Missing API keys in .env file');
    process.exit(1);
}

console.log('Environment variables loaded successfully.');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const personalApiKey = process.env.PERSONAL_API_KEY;

// 1. Download archive
async function downloadArchive(url, outputPath) {
    console.log(`Downloading archive from ${url}...`);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const buffer = await response.buffer();
        
        // Check if buffer is not empty
        if (!buffer || buffer.length === 0) {
            throw new Error('Downloaded file is empty!');
        }

        fs.writeFileSync(outputPath, buffer);
        
        // Verify file was written
        if (!fs.existsSync(outputPath)) {
            throw new Error('File was not saved correctly');
        }

        const fileSize = fs.statSync(outputPath).size;
        console.log(`Archive downloaded successfully. Size: ${fileSize} bytes`);
        
        // Check if it's a valid ZIP file
        try {
            const zip = new AdmZip(outputPath);
            const entries = zip.getEntries();
            console.log(`ZIP contains ${entries.length} files:`);
            entries.forEach(entry => {
                console.log(` - ${entry.entryName}`);
            });
        } catch (error) {
            throw new Error('Downloaded file is not a valid ZIP archive: ' + error.message);
        }
    } catch (error) {
        console.error('Error downloading archive:', error);
        throw error;
    }
}

// 2. Extract archive
function unzipFile(zipPath, extractTo) {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractTo, true);
    console.log('Archive extracted successfully.');
}

// 3. Convert MP3 to text using Whisper
async function transcribeAudio(audioPath) {
    try {
        console.log(`Transcribing ${audioPath}...`);
        
        const transcription = await openai.audio.transcriptions.create({
            file: createReadStream(audioPath),
            model: "whisper-1",
            language: "pl"
        });

        // Save transcription to a text file
        const transcriptionPath = audioPath.replace('.mp3', '_transcription.txt');
        fs.writeFileSync(transcriptionPath, transcription.text);
        
        console.log(`Transcription completed for ${audioPath}`);
        return transcription.text;
    } catch (error) {
        console.error(`Error transcribing ${audioPath}:`, error);
        throw error;
    }
}

// 4. Process transcripts and find answer
async function processTranscripts(folderPath) {
    // Check if folder exists
    if (!fs.existsSync(folderPath)) {
        throw new Error(`Folder ${folderPath} does not exist!`);
    }

    // Get list of M4A files instead of MP3
    const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.m4a'));
    console.log(`Found ${files.length} M4A files:`, files);

    if (files.length === 0) {
        throw new Error('No M4A files found in the extracted archive!');
    }

    let combinedTranscripts = '';
    
    for (const file of files) {
        const fullPath = path.join(folderPath, file);
        console.log(`\nProcessing ${file}...`);
        
        // Check if file exists and has content
        if (!fs.existsSync(fullPath)) {
            console.error(`File ${fullPath} does not exist!`);
            continue;
        }

        const fileSize = fs.statSync(fullPath).size;
        console.log(`File size: ${fileSize} bytes`);

        if (fileSize === 0) {
            console.error(`File ${file} is empty!`);
            continue;
        }

        try {
            const transcript = await transcribeAudio(fullPath);
            if (transcript) {
                combinedTranscripts += `\n=== Transcript from ${file} ===\n${transcript}\n\n`;
                console.log(`Successfully transcribed ${file}`);
            } else {
                console.error(`No transcript returned for ${file}`);
            }
        } catch (error) {
            console.error(`Error processing ${file}:`, error);
        }
    }

    // Save individual transcripts and combined transcripts
    const combinedPath = 'combined_transcripts.txt';
    fs.writeFileSync(combinedPath, combinedTranscripts);
    console.log(`Combined transcripts saved to ${combinedPath}`);

    // Verify the combined file
    if (!fs.existsSync(combinedPath) || fs.statSync(combinedPath).size === 0) {
        throw new Error('Combined transcripts file is empty or was not saved correctly!');
    }

    console.log('\nAnalyzing transcripts...');
    const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
            {
                role: "system",
                content: "You are helping to analyze interrogation transcripts to find information about Professor Andrzej Maj. Based on the transcripts and your knowledge, determine the street where his university is located."
            },
            {
                role: "user",
                content: `Analyze these interrogation transcripts and determine the street where Professor Andrzej Maj's university is located. Think step by step:\n${combinedTranscripts}`
            }
        ],
        temperature: 0
    });

    return completion.choices[0].message.content.trim();
}

// 5. Send report
async function sendReport(streetName) {
    try {
        const response = await fetch('https://centrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${personalApiKey}`
            },
            body: JSON.stringify({
                task: 'mp3',
                apikey: personalApiKey,
                answer: streetName
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

// Main execution
async function main() {
    console.log('Starting main process...');
    try {
        const zipUrl = 'https://centrala.ag3nts.org/dane/przesluchania.zip';
        const zipPath = './przesluchania.zip';
        const extractTo = './przesluchania';

        // Create extract directory if it doesn't exist
        if (!fs.existsSync(extractTo)) {
            fs.mkdirSync(extractTo);
        }

        // Download and extract
        console.log('Step 1: Downloading and extracting archive...');
        await downloadArchive(zipUrl, zipPath);
        
        console.log('Extracting archive...');
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(extractTo, true);
        console.log('Archive extracted successfully.');

        // Process transcripts
        console.log('Step 2: Processing transcripts...');
        const analysis = await processTranscripts(extractTo);
        console.log('Analysis result:', analysis);

        // Send report
        console.log('Step 3: Sending report...');
        await sendReport(analysis);

    } catch (error) {
        console.error('Error in main process:', error.message);
        console.error('Full error:', error);
    }
}

// Run the process with better error handling
console.log('Initializing process...');
main().then(() => {
    console.log('Process completed successfully.');
}).catch(error => {
    console.error('Process failed with error:', error);
    process.exit(1);
});
