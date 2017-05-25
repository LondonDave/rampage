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

	fmt.Printf("ORIGINAL   %#v\n", h)

	file, err := os.Create("filetest_1")
	encoder := gob.NewEncoder(file)
	encoder.Encode(h)

	rand.Seed(42)
	var j int
	var hup map[int]hand.Hand
	for i := 0; i < 1; i++ {
		// j = rand.Intn(10)
		j = 0
		h[j].IncrementSeq()
		hup := make(map[int]hand.Hand)
		hup[j] = h[j]
		encoder.Encode(hup)
	}
	fmt.Printf("UPDATE    %#v\n", hup)
	file.Close()

	file, err = os.Open("filetest_1")

	var decodedMap map[int]hand.Hand
	decoder := gob.NewDecoder(file)

	for {
		err = decoder.Decode(&decodedMap)
		if err != nil {
			fmt.Printf("DECODED   %#v\n", decodedMap)
			panic(err)
		}
		// fmt.Printf("%#v\n", decodedMap)
	}
	file.Close()
}
