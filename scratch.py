import sys
from Bio import Entrez
Entrez.email = 'test@example.com'
term = '("breast neoplasms"[MeSH Terms] OR "breast cancer"[Title/Abstract]) AND 2026/09/12:2026/09/19[EDAT]'
handle = Entrez.esearch(db='pubmed', term=term)
results = Entrez.read(handle)
print('Total Count:', results['Count'])
