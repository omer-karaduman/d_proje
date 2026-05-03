package kafka

import (
	"encoding/binary"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/confluentinc/confluent-kafka-go/v2/schemaregistry"
	"github.com/hamba/avro/v2"
)

type AvroHelper struct {
	srClient   schemaregistry.Client
	schemas    map[string]avro.Schema // subject → schema
	ids        map[string]int         // subject → schema ID
	idToSchema map[int]avro.Schema    // schema ID → schema (for deserialization)
}

func NewAvroHelper(srURL string) (*AvroHelper, error) {
	srClient, err := schemaregistry.NewClient(schemaregistry.NewConfig(srURL))
	if err != nil {
		return nil, err
	}

	return &AvroHelper{
		srClient:   srClient,
		schemas:    make(map[string]avro.Schema),
		ids:        make(map[string]int),
		idToSchema: make(map[int]avro.Schema),
	}, nil
}

// RegisterSchema registers a schema from a file to the specified topic subject and returns the Schema ID
func (a *AvroHelper) RegisterSchema(subject string, schemaFilePath string) error {
	schemaBytes, err := os.ReadFile(schemaFilePath)
	if err != nil {
		return fmt.Errorf("could not read schema file %s: %v", schemaFilePath, err)
	}

	schemaStr := string(schemaBytes)
	schemaInfo := schemaregistry.SchemaInfo{
		Schema:     schemaStr,
		SchemaType: "AVRO",
	}

	id, err := a.srClient.Register(subject, schemaInfo, true)
	if err != nil {
		return fmt.Errorf("could not register schema for subject %s: %v", subject, err)
	}

	parsedSchema, err := avro.Parse(schemaStr)
	if err != nil {
		return fmt.Errorf("could not parse avro schema for subject %s: %v", subject, err)
	}

	a.schemas[subject] = parsedSchema
	a.ids[subject] = id
	a.idToSchema[id] = parsedSchema // populate reverse map for deserialization
	log.Printf("Registered schema %s with ID %d", subject, id)
	return nil
}

// Serialize encodes a value to Avro and prepends the Confluent Schema Registry 5-byte header
func (a *AvroHelper) Serialize(subject string, value interface{}) ([]byte, error) {
	schema, ok := a.schemas[subject]
	if !ok {
		return nil, fmt.Errorf("schema not registered for subject %s", subject)
	}
	id := a.ids[subject]

	payload, err := avro.Marshal(schema, value)
	if err != nil {
		return nil, fmt.Errorf("avro marshal error for %s: %v", subject, err)
	}

	// Confluent wire format: Magic Byte (0) + Schema ID (4 bytes) + Avro Payload
	msg := make([]byte, 5+len(payload))
	msg[0] = 0
	binary.BigEndian.PutUint32(msg[1:5], uint32(id))
	copy(msg[5:], payload)

	return msg, nil
}

// Deserialize reads the Confluent 5-byte header, looks up the schema by ID
// from the local cache populated during RegisterSchema, and unmarshals Avro.
func (a *AvroHelper) Deserialize(msg []byte, v interface{}) error {
	if len(msg) < 5 {
		return fmt.Errorf("message too short to contain schema registry header")
	}
	if msg[0] != 0 {
		return fmt.Errorf("invalid magic byte")
	}

	id := int(binary.BigEndian.Uint32(msg[1:5]))

	// Look up schema in local cache (populated by RegisterSchema)
	parsedSchema, ok := a.idToSchema[id]
	if !ok {
		// Not in local cache — fetch schema string from Schema Registry and parse it
		schemaInfo, err := a.srClient.GetBySubjectAndID("", id)
		if err != nil {
			return fmt.Errorf("schema id %d not in local cache and SR fetch failed: %v", id, err)
		}
		parsedSchema, err = avro.Parse(schemaInfo.Schema)
		if err != nil {
			return fmt.Errorf("could not parse avro schema ID %d: %v", id, err)
		}
		a.idToSchema[id] = parsedSchema // cache for future use
	}

	if err := avro.Unmarshal(parsedSchema, msg[5:], v); err != nil {
		return fmt.Errorf("avro unmarshal error for schema ID %d: %v", id, err)
	}

	return nil
}

// InitSchemas pre-registers all required schemas from the given directory
func (a *AvroHelper) InitSchemas(schemaDir string) error {
	// We need to register schemas for the topics we produce to
	schemasToRegister := map[string]string{
		"game.orders.validated-value": "order_validated.avsc",
		"game.dlq-value":              "dlq_entry.avsc",
		"game.events.unit-value":      "unit_moved.avsc", // the engine produces multiple event types, we need multiple schemas
		"game.events.region-value":    "region_control_changed.avsc", // same
		"game.events.path-value":      "path_status_changed.avsc",    // same
		"game.broadcast-value":        "world_state_snapshot.avsc",
		"game.ring.position-value":    "ring_bearer_moved.avsc",
		"game.ring.detection-value":   "ring_bearer_detected.avsc",
		"game.session-value":          "world_state_snapshot.avsc", // Session is world state snapshot
		"game.orders.raw-value":       "order_submitted.avsc",
	}

	for subject, file := range schemasToRegister {
		path := filepath.Join(schemaDir, file)
		if _, err := os.Stat(path); err == nil {
			err := a.RegisterSchema(subject, path)
			if err != nil {
				log.Printf("Warning: failed to register schema %s: %v", subject, err)
			}
		}
	}
	return nil
}
