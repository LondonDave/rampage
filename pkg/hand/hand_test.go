package hand

import (
	"encoding/gob"
	"fmt"
	"io"
	"os"
	"testing"
	"time"
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

	for i := 1000; i < 1010; i++ {
		h[i] = *NewHand(i, 1)
	}

	file, err := os.Create("filetest_1")
	if err != nil {
		panic(err)
	}
	encoder := gob.NewEncoder(file)
	encoder.Encode(h)

	hu := h[1001]
	hu.Seq++
	hu.Player[0].Name = "Dave"
	h[1001] = hu

	update := make(map[int]Hand)
	update[1001] = hu
	encoder.Encode(update)

	file.Close()

	file, err = os.Open("filetest_1")
	if err != nil {
		panic(err)
	}

	var decodedMap map[int]Hand
	decoder := gob.NewDecoder(file)

	for {
		err = decoder.Decode(&decodedMap)
		if err == io.EOF {
			break
		}
		if err != nil {
			panic(err)
		}
	}
	file.Close()
	for index := 1000; index < 1010; index++ {

		if h[index].Player[0].Name != decodedMap[index].Player[0].Name {
			t.Errorf("Name %s\t%s", h[index].Player[0].Name, decodedMap[index].Player[0].Name)
		}
		if h[index].Seq != decodedMap[index].Seq {
			t.Errorf("Seq %v\t%v", h[index].Seq, decodedMap[index].Seq)
		}
	}
}

func TestPersistenceTiming(t *testing.T) {
	var start time.Time
	var secs float64

	h := make(map[int]Hand)

	for i := 1000; i < 1000+1000; i++ {
		h[i] = *NewHand(i, 1)
	}

	start = time.Now()

	file, err := os.Create("filetest_2")
	if err != nil {
		panic(err)
	}
	encoder := gob.NewEncoder(file)
	encoder.Encode(h)

	secs = time.Since(start).Seconds()
	fmt.Printf("Write %.3fs\n", secs)

	hu := h[1000]
	hu.Seq++
	hu.Player[0].Name = "Dave"
	h[1000] = hu

	update := make(map[int]Hand)
	update[1000] = hu
	encoder.Encode(update)

	start = time.Now()

	file.Sync()

	secs = time.Since(start).Seconds()
	fmt.Printf("Sync %.5fs\n", secs)

	start = time.Now()

	file.Close()

	secs = time.Since(start).Seconds()
	fmt.Printf("Close %.5fs\n", secs)

	start = time.Now()

	file, err = os.Open("filetest_2")
	if err != nil {
		panic(err)
	}

	var decodedMap map[int]Hand
	decoder := gob.NewDecoder(file)

	for {
		err = decoder.Decode(&decodedMap)
		if err == io.EOF {
			break
		}
		if err != nil {
			panic(err)
		}
	}
	file.Close()

	secs = time.Since(start).Seconds()
	fmt.Printf("Read %.3fs\n", secs)

}
