@prefix calli: <http://callimachusproject.org/rdf/2009/framework#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<> a calli:Purl , </callimachus/1.4/types/Purl> ;
    calli:copy "pages/profile.xhtml?view" ;
    dcterms:created "2015-07-20T13:19:35.641Z"^^xsd:dateTime ;
    rdfs:label "profile" ;
    calli:administrator </auth/groups/admin> , </auth/groups/super> ;
    calli:editor </auth/groups/power> , </auth/groups/staff> ;
    calli:reader </auth/groups/everyone> .
