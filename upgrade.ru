# upgrade.ru

PREFIX rdfs:<http://www.w3.org/2000/01/rdf-schema#>
PREFIX calli:<http://callimachusproject.org/rdf/2009/framework#>
PREFIX screener:<https://probabilitytrading.net/screener/2014/schema.ttl#>

## Upgrade from 0.10

DELETE {
    ?screen screener:hasWatchCriteria ?watch .
    ?watch ?wp ?wo .
    ?screen screener:hasHoldCriteria ?hold .
    ?hold ?hp ?ho .
} INSERT {
    ?screen screener:hasWatchCriteria ?wcriteria .
    ?profile calli:hasComponent ?wcriteria .
    ?wcriteria a screener:Criteria, ?Criteria .
    ?wcriteria rdfs:label ?label .
    ?wcriteria ?wp ?wo .
    ?screen screener:hasHoldCriteria ?hcriteria .
    ?profile calli:hasComponent ?hcriteria .
    ?hcriteria a screener:Criteria, ?Criteria .
    ?hcriteria rdfs:label ?label .
    ?hcriteria ?hp ?ho .
} WHERE {
    ?profile calli:hasComponent ?screen .
    ?screen a screener:Screen .
    ?screen a ?Screen .
    FILTER (?Screen != ?screen && strends(str(?Screen),"classes/Screen"))
    BIND (iri(replace(str(?Screen), 'Screen$','Criteria')) AS ?Criteria)
    {
        ?screen screener:hasWatchCriteria ?watch .
        ?watch ?wp ?wo
        OPTIONAL { ?watch screener:forIndicator [rdfs:label ?label] }
        BIND (iri(replace(str(?watch), '#','-')) AS ?wcriteria)
    } UNION {
        ?screen screener:hasHoldCriteria ?hold .
        ?hold ?hp ?ho
        OPTIONAL { ?hold screener:forIndicator [rdfs:label ?label] }
        BIND (iri(replace(str(?hold), '#','-')) AS ?hcriteria)
    }
}
