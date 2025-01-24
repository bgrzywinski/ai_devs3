import fetch from 'node-fetch';
import dotenv from 'dotenv';
import OpenAI from 'openai';

// Load environment variables
dotenv.config();

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function queryDatabase(query) {
    try {
        const response = await fetch('https://centrala.ag3nts.org/apidb', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                task: 'database',
                apikey: process.env.PERSONAL_API_KEY,
                query: query
            })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error querying database:', error);
        throw error;
    }
}

async function getTableStructures() {
    try {
        // First, get list of tables
        console.log('Getting list of tables...');
        const tablesResponse = await queryDatabase('show tables');
        
        if (tablesResponse.error !== 'OK' || !tablesResponse.reply) {
            throw new Error('Failed to get tables list');
        }

        // Extract table names from the response
        const tables = tablesResponse.reply.map(table => table.Tables_in_banan);
        console.log('Found tables:', tables);

        // Then, get structure for each table
        const structures = {};
        for (const table of tables) {
            console.log(`Getting structure for table ${table}...`);
            const structureResponse = await queryDatabase(`show create table ${table}`);
            if (structureResponse.error === 'OK' && structureResponse.reply) {
                structures[table] = structureResponse.reply;
            } else {
                console.error(`Failed to get structure for table ${table}`);
            }
        }

        console.log('Table structures:', JSON.stringify(structures, null, 2));
        return structures;
    } catch (error) {
        console.error('Error getting table structures:', error);
        throw error;
    }
}

async function findVulnerableDatacenters() {
    try {
        const query = `
            SELECT dc.dc_id 
            FROM datacenters dc
            JOIN users u ON dc.manager = u.id
            WHERE dc.is_active = 1 
            AND u.is_active = 0
        `;

        console.log('Executing query:', query);
        const response = await queryDatabase(query);
        
        if (response.error === 'OK' && response.reply) {
            const dcIds = response.reply.map(row => row.dc_id);
            console.log('Found vulnerable datacenters:', dcIds);
            return dcIds;
        } else {
            throw new Error('Failed to get vulnerable datacenters');
        }
    } catch (error) {
        console.error('Error finding vulnerable datacenters:', error);
        throw error;
    }
}

async function sendAnswer(dcIds) {
    try {
        const response = await fetch('https://centrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.PERSONAL_API_KEY}`
            },
            body: JSON.stringify({
                task: 'database',
                apikey: process.env.PERSONAL_API_KEY,
                answer: dcIds
            })
        });

        const result = await response.json();
        console.log('Answer submission result:', result);
        return result;
    } catch (error) {
        console.error('Error sending answer:', error);
        throw error;
    }
}

async function main() {
    try {
        // 1. Find vulnerable datacenters
        console.log('\nSearching for vulnerable datacenters...');
        const vulnerableDcIds = await findVulnerableDatacenters();

        // 2. Send the answer
        console.log('\nSending answer...');
        const result = await sendAnswer(vulnerableDcIds);
        
        console.log('Task completed:', result);

    } catch (error) {
        console.error('Error in main:', error);
    }
}

main();
