import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import AdmZip from 'adm-zip';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Get current file path in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function buildDetailedReport(directory) {
    try {
        console.log('\n=== Building Detailed Report ===');
        let reportContent = '# Detailed Analysis Report\n\n';

        // Process facts first
        console.log('\n📁 Processing facts directory...');
        reportContent += '## Facts Analysis\n\n';
        const factsDir = path.join(directory, 'facts');
        const factFiles = await fs.readdir(factsDir);
        const factTxtFiles = factFiles.filter(file => file.endsWith('.txt'));
        
        console.log(`Found ${factTxtFiles.length} fact files to process`);
        
        for (const file of factTxtFiles) {
            console.log(`\n📄 Processing fact file: ${file}`);
            const content = await fs.readFile(path.join(factsDir, file), 'utf-8');
            console.log('Content length:', content.length, 'characters');
            
            console.log('Analyzing content...');
            const analysis = await analyzeContent(content, 'fact');
            console.log('Analysis completed. Length:', analysis.length, 'characters');
            
            reportContent += `### ${file}\n${analysis}\n\n`;
            console.log(`✅ Fact file ${file} processed`);
        }

        // Process main files
        console.log('\n📁 Processing main directory files...');
        reportContent += '## Main Files Analysis\n\n';
        const files = await fs.readdir(directory);
        const txtFiles = files
            .filter(file => file.endsWith('.txt'))
            .filter(file => !file.includes('facts/'));

        console.log(`Found ${txtFiles.length} main files to process`);

        for (const file of txtFiles) {
            console.log(`\n📄 Processing main file: ${file}`);
            const content = await fs.readFile(path.join(directory, file), 'utf-8');
            console.log('Content length:', content.length, 'characters');
            
            console.log('Analyzing content...');
            const analysis = await analyzeContent(content, 'main');
            console.log('Analysis completed. Length:', analysis.length, 'characters');
            
            reportContent += `### ${file}\n${analysis}\n\n`;
            console.log(`✅ Main file ${file} processed`);
        }

        // Save report with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportFilename = `report_${timestamp}.md`;
        await fs.writeFile(reportFilename, reportContent);
        console.log(`\n📝 Detailed report saved to ${reportFilename}`);
        
        // Also save latest version
        await fs.writeFile('report_latest.md', reportContent);
        console.log('📝 Latest report saved to report_latest.md');
        
        return reportContent;
    } catch (error) {
        console.error('❌ Error building report:', error);
        throw error;
    }
}

async function analyzeContent(content, type) {
    try {
        console.log(`\n🔍 Analyzing ${type} content...`);
        console.log('Content excerpt:', content.substring(0, 100) + '...');
        
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are analyzing ${type} files from a factory security system.
Create a detailed analysis including:

1. MAIN TOPICS:
   - Key themes and subjects
   - Primary security concerns
   - Human or animal activity
   - Technical elements
   - Security breaches
   - sectors and buildings

2. EVENTS:
   - Specific incidents
   - Timeline of events
   - Security breaches

3. TECHNICAL DETAILS:
   - Systems involved
   - Technical specifications
   - Security measures

5. CONNECTIONS:
   - Links to other events
   - Related personnel
   - System interconnections

Provide analysis in Polish. Be specific and detailed.`
                },
                {
                    role: "user",
                    content: `Analyze this content:\n\n${content}`
                }
            ],
            temperature: 0,
            max_tokens: 1000
        });

        const analysis = response.choices[0].message.content.trim();
        console.log('✅ Analysis completed');
        console.log('Analysis length:', analysis.length, 'characters');
        console.log('Analysis excerpt:', analysis.substring(0, 100) + '...');
        
        return analysis;
    } catch (error) {
        console.error('❌ Error in content analysis:', error);
        throw error;
    }
}

async function generateMetadata(reportContent, directory) {
    try {
        console.log('\nGenerating metadata from report...');
        const metadata = {};
        
        const files = await fs.readdir(directory);
        const txtFiles = files
            .filter(file => file.endsWith('.txt'))
            .filter(file => !file.includes('facts/'));

        for (const file of txtFiles) {
            console.log(`Generating keywords for ${file}`);
            const keywords = await generateKeywords(file, reportContent);
            metadata[file] = keywords;
        }

        return metadata;
    } catch (error) {
        console.error('Error generating metadata:', error);
        throw error;
    }
}

async function generateKeywords(filename, reportContent) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `Based on the detailed report, generate exactly 10 relevant keywords in Polish for the specified file.
Keywords should:
- Be in nominative case
- Be specific and searchable
- Relate to security events, people, places, or technical aspects
- Consider connections with other files
- Be based on the entire context from the report
- Good to pay attention on people and locations, animals and objects, sectors and buildings, technical elements, events and incidents
`
                },
                {
                    role: "user",
                    content: `Report content: ${reportContent}\n\nGenerate 10 keywords for file: ${filename}`
                }
            ],
            temperature: 0,
            max_tokens: 150
        });

        return response.choices[0].message.content.trim();
    } catch (error) {
        console.error(`Error generating keywords for ${filename}:`, error);
        throw error;
    }
}

async function buildContextualMetadata(directory) {
    try {
        console.log('\n=== Building Contextual Metadata ===');

        // Step 1: Build and Classify Knowledge Base
        console.log('\n1️⃣ Building and classifying knowledge base...');
        const knowledgeBase = await buildKnowledgeBase(directory);
        console.log(`Found ${Object.keys(knowledgeBase.people).length} people and ${Object.keys(knowledgeBase.locations).length} locations`);
        
        // Step 2: Process reports using classified knowledge
        console.log('\n2️⃣ Processing reports with classified knowledge...');
        const metadata = await processReportsWithKnowledge(directory, knowledgeBase);
        
        return metadata;
    } catch (error) {
        console.error('❌ Error building contextual metadata:', error);
        throw error;
    }
}

async function buildKnowledgeBase(directory) {
    try {
        const factsDir = path.join(directory, 'facts');
        const factFiles = (await fs.readdir(factsDir)).filter(f => f.endsWith('.txt'));
        
        // Initialize knowledge base structure
        const knowledgeBase = {
            people: {},    // Person -> {role, events, facts}
            locations: {}, // Location -> {type, events, facts}
        };
        
        for (const file of factFiles) {
            console.log(`\n📄 Processing fact file: ${file}`);
            const content = await fs.readFile(path.join(factsDir, file), 'utf-8');
            
            // Classify and extract entities
            const entities = await classifyEntities(content);
            
            // Update knowledge base with people
            for (const person of entities.people) {
                if (!knowledgeBase.people[person.name]) {
                    knowledgeBase.people[person.name] = {
                        role: person.role,
                        events: [],
                        facts: []
                    };
                }
                knowledgeBase.people[person.name].facts.push({
                    file,
                    content,
                    isMainPerson: person.isMainPerson
                });
            }
            
            // Update knowledge base with locations
            for (const location of entities.locations) {
                if (!knowledgeBase.locations[location.name]) {
                    knowledgeBase.locations[location.name] = {
                        type: location.type,
                        events: [],
                        facts: []
                    };
                }
                knowledgeBase.locations[location.name].facts.push({
                    file,
                    content
                });
            }
        }
        
        return knowledgeBase;
    } catch (error) {
        console.error('Error building knowledge base:', error);
        return { people: {}, locations: {} };
    }
}

async function classifyEntities(content) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `Analyze this text focusing on key security-relevant entities:

IDENTIFY AND CLASSIFY:
1. PEOPLE
   - Names and roles
   - Whether they were captured/detected
   - Their technical expertise (if any)
   - Their authorization level

2. LOCATIONS
   - Sector names and numbers
   - Specific areas (labs, offices, etc.)
   - Security-relevant zones
   - Areas with reported activity

3. TECHNICAL ELEMENTS
   - Hardware systems
   - Security equipment
   - Machines and devices
   - Technical infrastructure

Return as JSON in this format:
{
    "people": [
        {
            "name": "person's name",
            "role": "their role/expertise",
            "isMainPerson": true/false,
            "detectionStatus": "captured/detected/authorized/unauthorized"
        }
    ],
    "locations": [
        {
            "name": "location name",
            "type": "sector/area type",
            "securityStatus": "status of the area"
        }
    ]
}`
                },
                {
                    role: "user",
                    content: content
                }
            ],
            temperature: 0,
            response_format: { type: "json_object" }
        });

        return JSON.parse(response.choices[0].message.content);
    } catch (error) {
        console.error('Error classifying entities:', error);
        return { people: [], locations: [] };
    }
}

async function processReportsWithKnowledge(directory, knowledgeBase) {
    try {
        const files = (await fs.readdir(directory))
            .filter(f => f.endsWith('.txt'))
            .filter(f => !f.includes('facts/'));
        
        const metadata = {};
        
        for (const file of files) {
            console.log(`\n📄 Processing report: ${file}`);
            const content = await fs.readFile(path.join(directory, file), 'utf-8');
            
            // Classify report entities
            const reportEntities = await classifyEntities(content);
            
            // Generate contextual keywords using knowledge base
            const keywords = await generateContextualKeywordsWithKnowledge(
                content,
                reportEntities,
                knowledgeBase
            );
            
            metadata[file] = keywords;
        }
        
        return metadata;
    } catch (error) {
        console.error('Error processing reports:', error);
        throw error;
    }
}

async function generateContextualKeywordsWithKnowledge(content, reportEntities, knowledgeBase) {
    try {
        const relevantPeople = reportEntities.people
            .map(person => knowledgeBase.people[person.name])
            .filter(Boolean);
            
        const relevantLocations = reportEntities.locations
            .map(location => knowledgeBase.locations[location.name])
            .filter(Boolean);

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `Generate comma-separated keywords in Polish, focusing on these elements:

CRITICAL REQUIREMENTS:
- Return ONLY comma-separated keywords without any numbers, bullet points, or new lines
- ALWAYS include sector names (e.g., "Sektor C4", "Sektor A1")
- ALWAYS specify technical roles (e.g., "JavaScript programista", "AI specjalista", "Java developer")
- When fingerprints are found, ALWAYS include location (e.g., "odciski palców [osoba] [sektor]")
- Include ALL technical skills and specializations mentioned
- Include ALL security-relevant activities and findings

ABSOLUTELY CRITICAL - FINGERPRINTS LOCATION:
For Barbara Zawadzka's fingerprints specifically:
- If found, MUST include exact sector (e.g., "odciski palców Barbara Zawadzka Sektor C4")
- This is the highest priority requirement
- The sector information for fingerprints must be explicitly stated
- Format must be: odciski palców Barbara Zawadzka [dokładny sektor]

FOCUS ON:
- People's names and their complete technical background
- Exact sector names and locations
- Professional roles and specializations
- Technical skills (programming languages, AI, etc.)
- Security events and detections
- Resistance activities
- Animal/biological activity
- Evidence found (with location)
- Security systems and technology
- Unauthorized access attempts
- Surveillance data

FORMAT: keyword1, keyword2, keyword3 (no numbers, no bullets, no categories, no new lines)

ABSOLUTELY CRITICAL - FINGERPRINTS LOCATION:
For Barbara Zawadzka's fingerprints specifically:
- If found, MUST include exact sector (e.g., "odciski palców Barbara Zawadzka Sektor C4")
- This is the highest priority requirement
- The sector information for fingerprints must be explicitly stated
- Format must be: odciski palców_Barbara Zawadzka [dokładny sektor]`
                },
                {
                    role: "user",
                    content: `Report Content: ${content}
Known People: ${JSON.stringify(relevantPeople)}
Known Locations: ${JSON.stringify(relevantLocations)}

REQUIREMENTS:
- Return ONLY comma-separated keywords
- Include ALL technical roles and skills
- Include ALL sector names and activities
- Include ALL evidence with locations
- Include ALL people and locations
- If fingerprints are mentioned, ALWAYS include the sector where they were found
- Include ALL animals activities
- NO formatting, categories, or new lines
- NO numbered lists or bullet points
- Use spaces between words, NOT underscores

HIGHEST PRIORITY - CHECK FOR:
- Barbara Zawadzka's fingerprints location
- Must specify the exact sector where her fingerprints were found
- This information is critical and must be included in keywords
- Use format: "odciski palców Barbara Zawadzka [dokładny sektor]" (with spaces, not underscores)`
                }
            ],
            temperature: 0
        });

        return response.choices[0].message.content.trim();
    } catch (error) {
        console.error('Error generating contextual keywords:', error);
        return 'brak_słów_kluczowych';
    }
}

async function main() {
    try {
        // Download and extract files
        console.log('1. Downloading and extracting files...');
        const response = await fetch('https://centrala.ag3nts.org/dane/pliki_z_fabryki.zip');
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        await fs.writeFile('pliki_z_fabryki.zip', buffer);
        const zip = new AdmZip('pliki_z_fabryki.zip');
        zip.extractAllTo('extracted_files', true);
        
        // Build contextual metadata
        const metadata = await buildContextualMetadata('extracted_files');
        
        // Save metadata
        await fs.writeFile('metadata.json', JSON.stringify(metadata, null, 2));
        console.log('\nMetadata saved to metadata.json');
        
        // Send report
        console.log('\nSending report...');
        const reportResult = await sendReport(metadata);
        console.log('Report sent:', reportResult);
        
        // Cleanup
        await fs.unlink('pliki_z_fabryki.zip');
        await fs.rm('extracted_files', { recursive: true });
        console.log('Cleanup completed');
        
    } catch (error) {
        console.error('Error in main:', error);
    }
}

async function sendReport(metadata) {
    try {
        const response = await fetch('https://centrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.PERSONAL_API_KEY}`
            },
            body: JSON.stringify({
                task: 'dokumenty',
                apikey: process.env.PERSONAL_API_KEY,
                answer: metadata
            })
        });

        return await response.json();
    } catch (error) {
        console.error('Error sending report:', error);
        throw error;
    }
}
                    
main();
