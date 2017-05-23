package main

import (
	"encoding/gob"
	"fmt"
	"math/rand"
	"os"

	"github.com/londondave/rampage/pkg/hand"
)

func main() {

	h := make(map[int]hand.Hand)

	for i := 0; i < 1; i++ {
		h[i] = *hand.NewHand(i, 1)
	}

	fmt.Printf("%#v\n", h)

	file, err := os.Create("filetest_1")
	encoder := gob.NewEncoder(file)
	encoder.Encode(h)

	rand.Seed(42)
	var j int
	for i := 0; i < 1; i++ {
		j = rand.Intn(10)
		j = 1
		h[j].IncrementSeq()
		hup := make(map[int]hand.Hand)
		hup[j] = h[j]
		encoder.Encode(hup)
	}
	fmt.Printf("%#v\n", h)
	file.Close()

	file, err = os.Open("filetest_1")

	var decodedMap map[int]hand.Hand
	decoder := gob.NewDecoder(file)

	for {
		err = decoder.Decode(&decodedMap)
		if err != nil {
			panic(err)
		}
		fmt.Printf("%#v\n", decodedMap)
	}
	file.Close()
}
