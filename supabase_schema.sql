-- Supabase (PostgreSQL) Schema for Breast Cancer News

-- Create the articles table
CREATE TABLE articles (
    pmid TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    title_ja TEXT NOT NULL,
    journal TEXT,
    pub_date TEXT,
    authors JSONB DEFAULT '[]'::jsonb,
    doi TEXT,
    score INTEGER,
    score_reason TEXT,
    category TEXT,
    summary_3lines JSONB DEFAULT '[]'::jsonb,
    slides JSONB DEFAULT '[]'::jsonb,
    keywords JSONB DEFAULT '[]'::jsonb,
    cancer_type TEXT NOT NULL DEFAULT 'breast',
    published_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Create indexes for frequently queried columns
CREATE INDEX idx_articles_cancer_type ON articles(cancer_type);
CREATE INDEX idx_articles_category ON articles(category);
CREATE INDEX idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX idx_articles_score ON articles(score DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anonymous read access (Anyone can read articles)
CREATE POLICY "Allow public read access" 
ON articles 
FOR SELECT 
USING (true);

-- Note: We do not create a policy for INSERT/UPDATE/DELETE for anonymous users.
-- The Python script (main.py) will use the Supabase Service Role Key to bypass RLS and insert data securely.
