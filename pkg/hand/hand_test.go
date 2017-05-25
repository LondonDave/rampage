package hand

import (
	"encoding/gob"
	"fmt"
	"os"
	"testing"
)

func equal(x, y []int) bool {
	if len(x) != len(y) {
		return false
	}
	for i := range x {
		if x[i] != y[i] {
			return false
		}
	}
	return true
}

func TestEvaluate(t *testing.T) {
	var tests = []struct {
		Cards string
		Value int
		Mask  []int
	}{
		{"AdAsQcJd5cKhTh", 0x5edcba, []int{1, 1, 0, 1, 1, 1, 0}},
		{"AdAsQcJd5c4hTh", 0x2eecba, []int{1, 1, 0, 0, 1, 1, 1}},
		{"AdAsQcJd5cAhTh", 0x4eeecb, []int{1, 1, 0, 1, 0, 1, 1}},
		{"Ad2sQcJd5c8hTh", 0x1ecba8, []int{1, 1, 0, 1, 1, 1, 0}},
		{"AdAhQcJh5hKhTh", 0x6edba5, []int{0, 1, 1, 1, 1, 0, 1}},
		{"AdAsTcJdAcKhTh", 0x7eeeaa, []int{1, 0, 1, 0, 1, 1, 1}},
		{"AdAsQcJdAcAhJh", 0x8eeeec, []int{1, 0, 1, 1, 0, 1, 1}},
		{"AdAsQcJd5cJhTh", 0x3eebbc, []int{1, 1, 0, 1, 0, 1, 1}},
		{"AdAsQdJd5cKdTd", 0x9edcba, []int{1, 1, 0, 1, 1, 1, 0}},
	}
	for _, test := range tests {

		c := evaluate(cardValue(test.Cards[0:4]), cardValue(test.Cards[4:]))

		if c.Value != test.Value {
			t.Errorf("%s\t%x\t%x\t%v\t%v", test.Cards, test.Value, c.Value, test.Mask, c.Mask)
		}
		if !equal(c.Mask, test.Mask) {
			t.Errorf("%s\t%x\t%x\t%v\t%v", test.Cards, test.Value, c.Value, test.Mask, c.Mask)
		}
	}
}

// func TestNew(t *testing.T) {
// h := *NewHand(1234, 1)
// fmt.Println(h)
// fmt.Println(h.player[0].Mask)
// }

func TestPersistence(t *testing.T) {
	h := make(map[int]Hand)

	for i := 1000; i < 11000; i++ {
		h[i] = *NewHand(i, 1)
	}

	// fmt.Printf("ORIGINAL   %#v\n", h)

	file, err := os.Create("filetest_1")
	encoder := gob.NewEncoder(file)
	encoder.Encode(h)

	huphand := h[1001]
	huphand.Seq++
	hup := make(map[int]Hand)
	hup[1001] = huphand
	encoder.Encode(hup)
	fmt.Printf("UPDATE    %#v\n", hup)
	file.Close()

	file, err = os.Open("filetest_1")

	var decodedMap map[int]Hand
	decoder := gob.NewDecoder(file)

	for {
		err = decoder.Decode(&decodedMap)
		if err != nil {
			// fmt.Printf("DECODED   %#v\n", decodedMap)
			panic(err)
		}
		// fmt.Printf("%#v\n", decodedMap)
	}
	file.Close()
}
