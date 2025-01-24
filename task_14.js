import fetch from 'node-fetch';
import dotenv from 'dotenv';
import OpenAI from 'openai';

// Load environment variables
dotenv.config();

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Set to store processed items to avoid infinite loops
const processedPeople = new Set();
const processedPlaces = new Set();
const allConnections = new Map();

// Dodajmy funkcję do śledzenia powiązań
const connections = new Map();

function addConnection(person, city) {
    if (!connections.has(person)) {
        connections.set(person, new Set());
    }
    connections.get(person).add(city);
}

async function downloadNote() {
    try {
        const response = await fetch('https://centrala.ag3nts.org/dane/barbara.txt');
        const text = await response.text();
        console.log('Downloaded note:', text);
        return text;
    } catch (error) {
        console.error('Error downloading note:', error);
        throw error;
    }
}

async function searchPerson(name) {
    if (processedPeople.has(name)) {
        return null;
    }
    
    try {
        console.log(`Searching for person: ${name}`);
        const response = await fetch('https://centrala.ag3nts.org/people', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                apikey: process.env.PERSONAL_API_KEY,
                query: name
            })
        });

        const data = await response.json();
        processedPeople.add(name);
        return data;
    } catch (error) {
        console.error(`Error searching for person ${name}:`, error);
        return null;
    }
}

async function searchPlace(city) {
    if (processedPlaces.has(city)) {
        return null;
    }

    try {
        const response = await fetch('https://centrala.ag3nts.org/places', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                apikey: process.env.PERSONAL_API_KEY,
                query: city
            })
        });

        const data = await response.json();
        processedPlaces.add(city);
        console.log(`Search results for city ${city}:`, data);
        return data;
    } catch (error) {
        console.error(`Error searching for city ${city}:`, error);
        return null;
    }
}

async function extractEntities(text) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "Extract names of people and cities from the text. Important rules:\n" +
                            "1. Use only capital ASCII letters (A-Z)\n" +
                            "2. Replace Polish letters: Ą->A, Ę->E, Ł->L, Ó->O, Ś->S, Ż/Ź->Z, Ć->C, Ń->N\n" +
                            "3. For people, use only first names\n" +
                            "4. Format response exactly as: {\"people\": [\"NAME1\", \"NAME2\"], \"cities\": [\"CITY1\", \"CITY2\"]}"
                },
                {
                    role: "user",
                    content: text
                }
            ]
        });

        const result = JSON.parse(response.choices[0].message.content);
        console.log('Extracted entities:', result);
        return result;
    } catch (error) {
        console.error('Error extracting entities:', error);
        throw error;
    }
}

async function processData(initialEntities) {
    const toProcess = {
        people: [...initialEntities.people],
        cities: [...initialEntities.cities]
    };

    while (toProcess.people.length > 0 || toProcess.cities.length > 0) {
        // Process people
        while (toProcess.people.length > 0) {
            const person = toProcess.people.shift();
            const personResult = await searchPerson(person);
            
            if (personResult && personResult.cities) {
                for (const city of personResult.cities) {
                    if (!processedPlaces.has(city)) {
                        toProcess.cities.push(city);
                    }
                }
            }
        }

        // Process cities
        while (toProcess.cities.length > 0) {
            const city = toProcess.cities.shift();
            const cityResult = await searchPlace(city);
            
            if (cityResult && cityResult.people) {
                for (const person of cityResult.people) {
                    if (!processedPeople.has(person)) {
                        toProcess.people.push(person);
                    }
                }
            }
        }
    }
}

async function sendReport(location) {
    try {
        // Najpierw pobierz token dla zadania
        const tokenResponse = await fetch('https://centrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                apikey: process.env.PERSONAL_API_KEY
            })
        });

        const tokenData = await tokenResponse.json();
        
        // Teraz wyślij odpowiedź z tokenem
        const response = await fetch('https://centrala.ag3nts.org/report' + tokenData.token, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                task: 'loop',
                apikey: process.env.PERSONAL_API_KEY,
                answer: location
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

// Dodajmy funkcję do czyszczenia imion
function cleanName(name) {
    return name.split(' ')[0].toUpperCase();
}

async function main() {
    try {
        let connections = new Map();
        let barbaraPath = [];

        // Najpierw sprawdźmy ruch Barbary
        console.log('\nTracking Barbara\'s movement:');
        const barbaraResult = await searchPerson('BARBARA');
        if (barbaraResult && barbaraResult.message) {
            console.log('Barbara\'s known locations:', barbaraResult.message);
        }

        // Sprawdźmy osoby powiązane z Barbarą
        const keyPeople = ['ALEKSANDER', 'ADAM', 'AZAZEL', 'GABRIEL'];
        
        console.log('\nChecking people connected to Barbara:');
        for (const person of keyPeople) {
            const result = await searchPerson(person);
            if (result && result.message) {
                const locations = result.message.split(' ')
                    .filter(loc => !loc.includes('**'));
                console.log(`${person}'s path:`, locations.join(' -> '));
                connections.set(person, locations);
            }
        }

        // Sprawdźmy chronologicznie miasta
        const citiesToCheck = ['KRAKOW', 'WARSZAWA', 'LUBLIN', 'GRUDZIADZ', 'CIECHOCINEK', 'ELBLAG', 'FROMBORK', 'KONIN'];
        
        console.log('\nChecking each city for current visitors:');
        for (const city of citiesToCheck) {
            const result = await searchPlace(city);
            if (result && result.message) {
                const visitors = result.message.split(' ')
                    .filter(v => !v.includes('**'));
                console.log(`${city} current visitors:`, visitors);
                
                if (visitors.includes('BARBARA')) {
                    barbaraPath.push(city);
                }
            }
        }

        console.log('\nBarbara\'s movement path:', barbaraPath.join(' -> '));
        
        // Szczególnie sprawdźmy ELBLAG i FROMBORK
        console.log('\nDetailed check of key locations:');
        const keyLocations = ['ELBLAG', 'FROMBORK'];
        for (const city of keyLocations) {
            const result = await searchPlace(city);
            if (result && result.message) {
                console.log(`${city} detailed check:`, result.message);
            }
        }

        // Analiza wzorców
        console.log('\nAnalyzing patterns:');
        console.log('1. Barbara\'s known path:', barbaraPath);
        console.log('2. AZAZEL\'s movements:', connections.get('AZAZEL'));
        console.log('3. GABRIEL\'s locations:', connections.get('GABRIEL'));

        // Jeśli znaleźliśmy Barbarę w ostatnim mieście jej ścieżki
        if (barbaraPath.length > 0) {
            const lastLocation = barbaraPath[barbaraPath.length - 1];
            console.log('\nAttempting to report Barbara\'s location:', lastLocation);
            await sendReport(lastLocation);
        }

    } catch (error) {
        console.error('Error in main:', error);
    }
}

main();
