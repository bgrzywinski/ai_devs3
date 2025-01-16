import { readFile } from 'fs/promises';
import fetch from 'node-fetch';

async function sendReport() {
    try {
        // Read the report.json file
        const reportData = await readFile('report.json', 'utf8');
        const report = JSON.parse(reportData);

        // Prepare the payload in the correct format
        const payload = {
            task: 'JSON',
            apikey: 'd7ea8987-9b50-4b26-9a08-2ddea3e3dad6',
            answer: report
        };

        // Send to centrala.ag3nts
        const response = await fetch('https://centrala.ag3nts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Server responded with ${response.status}: ${errorData}`);
        }

        console.log('Report successfully sent to centrala.ag3nts');

    } catch (error) {
        console.error('Error sending report:', error);
        throw error;
    }
}

// Execute the function
sendReport().catch(console.error);