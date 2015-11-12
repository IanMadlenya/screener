# upgrade.ru

PREFIX rdfs:<http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms:<http://purl.org/dc/terms/>
PREFIX prov:<http://www.w3.org/ns/prov#>
PREFIX calli:<http://callimachusproject.org/rdf/2009/framework#>
PREFIX keyword:<http://www.openrdf.org/rdf/2011/keyword#>
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
};

DELETE {
    ?screen screener:hasHoldCriteria ?hold .
    ?screen screener:hasWatchCriteria ?watch .
    ?watch screener:forIndicator ?indicator .
    ?watch screener:differenceFrom ?difference .
    ?watch screener:percentOf ?percent .
} INSERT {
    ?screen screener:hasCriteria ?hold .
    ?screen screener:hasCriteria ?watch .
    ?watch screener:forWatchIndicator ?indicator .
    ?watch screener:differenceFromWatch ?difference .
    ?watch screener:percentOfWatch ?percent .
} WHERE {
    {
        ?screen screener:hasHoldCriteria ?hold .
    } UNION {
        ?screen screener:hasWatchCriteria ?watch .
        OPTIONAL {
            ?watch screener:forIndicator ?indicator .
        } OPTIONAL {
            ?watch screener:differenceFrom ?difference .
        } OPTIONAL {
            ?watch screener:percentOf ?percent .
        }
    }
};

DELETE {
    ?screen screener:hasCriteria ?criteria .
    ?criteria a ?type .
    ?criteria keyword:phone ?phone. 
    ?criteria dcterms:modified ?modified. 
    ?criteria prov:wasGeneratedBy ?wasGeneratedBy .
    ?criteria ?p ?o
} INSERT {
    ?screen screener:hasCriteria ?hash .
    ?hash ?p ?o
} WHERE {
    ?screen screener:hasCriteria ?criteria
    {
        ?criteria a ?type
    } UNION {
        ?criteria keyword:phone ?phone
    } UNION {
        ?criteria dcterms:modified ?modified
    } UNION {
        ?criteria prov:wasGeneratedBy ?wasGeneratedBy
    } UNION {
        ?criteria ?p ?o
        FILTER (?p != rdf:type && ?p != keyword:phone && ?p != dcterms:modified && ?p != prov:wasGeneratedBy)
    }
    BIND (iri(replace(str(?criteria),"^.*[\\-/]",concat(str(?screen),"#"))) AS ?hash)
};

DELETE WHERE {
    ?screen screener:examines ?security
};

DELETE {
    ?criteria screener:favourableIntercept ?gainIntercept .
    ?criteria screener:favourableSlope ?gainSlope .
    ?criteria screener:favorableIntercept ?gainIntercept .
    ?criteria screener:favorableSlope ?gainSlope .
    ?criteria screener:adverseIntercept ?painIntercept .
    ?criteria screener:adverseSlope ?painSlope .
} INSERT {
    ?criteria screener:gainIntercept ?gainIntercept .
    ?criteria screener:gainSlope ?gainSlope .
    ?criteria screener:painIntercept ?painIntercept .
    ?criteria screener:painSlope ?painSlope .
} WHERE {
    {
        ?criteria screener:favourableIntercept ?gainIntercept
    } UNION {
        ?criteria screener:favourableSlope ?gainSlope
    } UNION {
        ?criteria screener:favorableIntercept ?gainIntercept
    } UNION {
        ?criteria screener:favorableSlope ?gainSlope
    } UNION {
        ?criteria screener:adverseIntercept ?painIntercept
    } UNION {
        ?criteria screener:adverseSlope ?painSlope
    }
};

INSERT {
    ?criteria screener:weight "50"^^xsd:decimal
} WHERE {
    ?screen screener:hasCriteria ?criteria
    FILTER NOT EXISTS { ?criteria screener:weight ?weight }
};

DELETE {
    ?criteria screener:againstCorrelated ?bool
} INSERT {
    ?criteria screener:againstCorrelated ?boolean
} WHERE {
    ?criteria screener:againstCorrelated ?bool
    FILTER (datatype(?bool) != xsd:boolean)
    BIND (strdt(str(?bool), xsd:boolean) AS ?boolean)
};

INSERT {
    ?profile a screener:Profile
} WHERE {
    </p/> calli:hasComponent ?profile
    FILTER NOT EXISTS { ?profile a screener:Profile }
};

DELETE {
    ?profile calli:hasComponent ?component
} WHERE {
    ?profile a screener:Profile; calli:hasComponent ?component
    FILTER NOT EXISTS { ?component ?p ?o }
};

